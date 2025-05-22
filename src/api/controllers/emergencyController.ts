//Emergency Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import { geocodingClient } from "../../config/mapbox"
import type { Request, Response } from "express"
import { getDistance } from "geolib"

// Schemas
export const requestEmergencySchema = z.object({
  emergencyType: z.enum(["POLICE", "AMBULANCE", "FIRE"]),
  description: z.string(),
  address: z.string(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
})

export const updateEmergencyStatusSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "DISPATCHED", "ARRIVED", "RESOLVED", "CANCELLED"]),
  notes: z.string().optional(),
})

// Request emergency service
export const requestEmergencyService = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = requestEmergencySchema.parse(req.body)

    // Geocode address
    const geoResponse = await geocodingClient.forwardGeocode({ query: data.address }).send()
    const feature = geoResponse.body.features[0]
    if (!feature) {
      return res.status(400).json({ error: "Invalid address" })
    }

    // Create location
    const location = await prisma.location.create({
      data: {
        latitude: feature.center[1],
        longitude: feature.center[0],
        address: feature.place_name,
        city: feature.context.find((c: any) => c.id.includes("place"))?.text || "",
        country: feature.context.find((c: any) => c.id.includes("country"))?.text || "",
        state: feature.context.find((c: any) => c.id.includes("region"))?.text || "",
        placeId: feature.id,
      },
    })

    // Get emergency service type
    const serviceType = await prisma.serviceType.findFirst({
      where: { category: "EMERGENCY" },
    })

    if (!serviceType) {
      return res.status(400).json({ error: "Emergency service type not found" })
    }

    // Create service
    const service = await prisma.service.create({
      data: {
        userId,
        serviceTypeId: serviceType.id,
        status: "REQUESTED",
        pickupLocationId: location.id,
        emergencyType: data.emergencyType,
        estimatedPrice: 0, // Emergency services might be free or billed later
        notes: data.description,
      },
    })

    // Find nearest available driver with emergency service capability
    const availableDrivers = await prisma.driverProfile.findMany({
      where: {
        currentStatus: "ONLINE",
        approvalStatus: "APPROVED",
        assignedDriverTypes: {
          some: {
            serviceTypeId: serviceType.id,
            isActive: true,
          },
        },
        currentLocationId: { not: null },
      },
      include: { currentLocation: true },
    })

    let nearestDriver = null
    let minDistance = Number.POSITIVE_INFINITY

    for (const driver of availableDrivers) {
      if (driver.currentLocation) {
        const distance = getDistance(
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: driver.currentLocation.latitude, longitude: driver.currentLocation.longitude },
        )
        if (distance < minDistance) {
          minDistance = distance
          nearestDriver = driver
        }
      }
    }

    // If a driver is found, assign them
    if (nearestDriver) {
      await prisma.service.update({
        where: { id: service.id },
        data: {
          driverId: nearestDriver.id,
          status: "DRIVER_ACCEPTED",
        },
      })

      await prisma.driverProfile.update({
        where: { id: nearestDriver.id },
        data: { currentStatus: "ON_TRIP" },
      })

      // Create notification for driver
      await prisma.notification.create({
        data: {
          userId: nearestDriver.userId,
          title: "Emergency Request",
          body: `You have been assigned to an emergency ${data.emergencyType} request`,
          type: "EMERGENCY",
          data: JSON.stringify({ serviceId: service.id }),
        },
      })

      // Emit socket event
      ;(req as any).io.to(`driver:${nearestDriver.id}`).emit("emergency:assigned", {
        serviceId: service.id,
        emergencyType: data.emergencyType,
        location: location,
      })
    }

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId,
        title: "Emergency Request Received",
        body: `Your emergency request has been received and is being processed.`,
        type: "EMERGENCY",
        data: JSON.stringify({ serviceId: service.id }),
      },
    })

    res.status(201).json({
      service,
      message: "Emergency request received",
      estimatedResponseTime: nearestDriver ? Math.ceil(minDistance / 500) : "Unknown", // Rough estimate: 500m per minute
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get emergency service details
export const getEmergencyServiceDetails = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: {
        id,
        userId,
        serviceType: {
          category: "EMERGENCY",
        },
      },
      include: {
        pickupLocation: true,
        driver: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
            currentLocation: true,
          },
        },
        serviceType: true,
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Emergency service not found" })
    }

    res.json(service)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Update emergency status (driver only)
export const updateEmergencyStatus = async (req: Request, res: Response) => {
  try {
    const driver = (req as any).driver
    const { id } = req.params
    const data = updateEmergencyStatusSchema.parse(req.body)

    // Check if service exists and is assigned to this driver
    const service = await prisma.service.findUnique({
      where: {
        id,
        driverId: driver.id,
        serviceType: {
          category: "EMERGENCY",
        },
      },
      include: {
        pickupLocation: true,
        user: true,
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Emergency service not found or not assigned to you" })
    }

    // Update service status
    const updatedService = await prisma.service.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes ? `${service.notes || ""}\n\nDriver: ${data.notes}` : service.notes,
        startTime: data.status === "DISPATCHED" ? new Date() : service.startTime,
        completedTime: data.status === "RESOLVED" ? new Date() : service.completedTime,
      },
    })

    // If resolved, update driver status
    if (data.status === "RESOLVED") {
      await prisma.driverProfile.update({
        where: { id: driver.id },
        data: { currentStatus: "ONLINE" },
      })
    }

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId: service.userId,
        title: "Emergency Update",
        body: getEmergencyStatusMessage(data.status),
        type: "EMERGENCY",
        data: JSON.stringify({ serviceId: service.id }),
      },
    })

    // Emit socket event
    ;(req as any).io.to(`service:${service.id}`).emit("emergency:status_update", {
      serviceId: service.id,
      status: data.status,
    })

    res.json(updatedService)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get emergency history
export const getEmergencyHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const isDriver = req.query.driver === "true"

    let services

    if (isDriver) {
      const driver = await prisma.driverProfile.findUnique({
        where: { userId },
      })

      if (!driver) {
        return res.status(404).json({ error: "Driver profile not found" })
      }

      services = await prisma.service.findMany({
        where: {
          driverId: driver.id,
          serviceType: {
            category: "EMERGENCY",
          },
        },
        include: {
          pickupLocation: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    } else {
      services = await prisma.service.findMany({
        where: {
          userId,
          serviceType: {
            category: "EMERGENCY",
          },
        },
        include: {
          pickupLocation: true,
          driver: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    }

    res.json(services)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Cancel emergency request
export const cancelEmergencyRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: {
        id,
        userId,
        serviceType: {
          category: "EMERGENCY",
        },
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Emergency service not found" })
    }

    // Only allow cancellation if not already in progress
    if (["IN_PROGRESS", "RESOLVED", "CANCELLED"].includes(service.status)) {
      return res.status(400).json({ error: "Cannot cancel emergency service in current state" })
    }

    // Update service status
    const updatedService = await prisma.service.update({
      where: { id },
      data: {
        status: "CANCELLED",
        completedTime: new Date(),
      },
    })

    // If a driver was assigned, update their status
    if (service.driverId) {
      await prisma.driverProfile.update({
        where: { id: service.driverId },
        data: { currentStatus: "ONLINE" },
      })

      // Create notification for driver
      await prisma.notification.create({
        data: {
          userId: (await prisma.driverProfile.findUnique({ where: { id: service.driverId } }))?.userId || "",
          title: "Emergency Request Cancelled",
          body: "The emergency request you were assigned to has been cancelled.",
          type: "EMERGENCY",
          data: JSON.stringify({ serviceId: service.id }),
        },
      })

      // Emit socket event
      ;(req as any).io.to(`driver:${service.driverId}`).emit("emergency:cancelled", {
        serviceId: service.id,
      })
    }

    res.json({
      service: updatedService,
      message: "Emergency request cancelled",
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Helper function to generate status messages
function getEmergencyStatusMessage(status: string): string {
  switch (status) {
    case "ACKNOWLEDGED":
      return "Your emergency request has been acknowledged."
    case "DISPATCHED":
      return "Help is on the way to your location."
    case "ARRIVED":
      return "Emergency responder has arrived at your location."
    case "RESOLVED":
      return "Your emergency situation has been resolved."
    case "CANCELLED":
      return "Your emergency request has been cancelled."
    default:
      return `Your emergency request status has been updated to ${status}.`
  }
}
