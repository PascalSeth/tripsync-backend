//Shared Ride Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import { geocodingClient } from "../../config/mapbox"
import type { Request, Response } from "express"
import { getDistance } from "geolib"

// Schemas
export const estimateSharedRideSchema = z.object({
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  passengerCount: z.number().min(1).max(4),
  scheduledTime: z.string().datetime().optional(),
  maxWaitMinutes: z.number().min(5).max(30).default(15),
  maxDetourPercent: z.number().min(0).max(50).default(20),
})

export const bookSharedRideSchema = z.object({
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  passengerCount: z.number().min(1).max(4),
  scheduledTime: z.string().datetime().optional(),
  maxWaitMinutes: z.number().min(5).max(30).default(15),
  maxDetourPercent: z.number().min(0).max(50).default(20),
  serviceTypeId: z.string().uuid(),
})

// Estimate shared ride price and potential matches
export const estimateSharedRide = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = estimateSharedRideSchema.parse(req.body)

    // Geocode pickup and dropoff
    const [pickupGeo, dropoffGeo] = await Promise.all([
      geocodingClient.forwardGeocode({ query: data.pickupAddress }).send(),
      geocodingClient.forwardGeocode({ query: data.dropoffAddress }).send(),
    ])

    const pickupFeature = pickupGeo.body.features[0]
    const dropoffFeature = dropoffGeo.body.features[0]
    if (!pickupFeature || !dropoffFeature) {
      return res.status(400).json({ error: "Invalid address" })
    }

    // Calculate direct route
    const pickupCoords = {
      latitude: pickupFeature.center[1],
      longitude: pickupFeature.center[0],
    }
    const dropoffCoords = {
      latitude: dropoffFeature.center[1],
      longitude: dropoffFeature.center[0],
    }

    const directDistance = getDistance(pickupCoords, dropoffCoords)
    const directPrice = 5 + directDistance * 0.001 // Base price + per km

    // Find potential shared ride groups
    const maxDetourDistance = directDistance * (1 + data.maxDetourPercent / 100)
    const timeWindow = data.scheduledTime ? new Date(data.scheduledTime).getTime() : Date.now()
    const maxTimeWindow = timeWindow + data.maxWaitMinutes * 60 * 1000

    // Find active shared ride groups that could match
    const activeGroups = await prisma.sharedRideGroup.findMany({
      where: {
        status: { in: ["REQUESTED", "SEARCHING_DRIVER", "DRIVER_ACCEPTED"] },
        createdAt: { gte: new Date(timeWindow - 30 * 60 * 1000) }, // Within 30 minutes
        currentCapacity: { lt: 4 }, // Has space
      },
      include: {
        route: {
          include: {
            originLocation: true,
            destinationLocation: true,
          },
        },
        services: {
          include: {
            pickupLocation: true,
            dropoffLocation: true,
          },
        },
      },
    })

    // Calculate potential matches
    const potentialMatches = activeGroups
      .filter((group) => {
        // Check if adding this ride would exceed max capacity
        if (group.currentCapacity + data.passengerCount > 4) return false

        // Check if route is compatible (simplified)
        const groupOrigin = {
          latitude: group.route.originLocation.latitude,
          longitude: group.route.originLocation.longitude,
        }
        const groupDestination = {
          latitude: group.route.destinationLocation.latitude,
          longitude: group.route.destinationLocation.longitude,
        }

        // Calculate pickup detour
        const pickupDetour = getDistance(groupOrigin, pickupCoords)
        // Calculate dropoff detour
        const dropoffDetour = getDistance(groupDestination, dropoffCoords)

        // Total potential detour
        const totalDetour = pickupDetour + dropoffDetour
        return totalDetour <= maxDetourDistance
      })
      .map((group) => ({
        groupId: group.id,
        currentPassengers: group.currentCapacity,
        estimatedDiscount: Math.min(40, 10 * (group.currentCapacity + 1)), // 10% per passenger, max 40%
        estimatedPickupTime: new Date(timeWindow + Math.random() * data.maxWaitMinutes * 60 * 1000),
      }))

    // Calculate shared price (with potential discount)
    const sharedPrice = potentialMatches.length
      ? directPrice * (1 - potentialMatches[0].estimatedDiscount / 100)
      : directPrice * 0.9 // 10% discount for new shared rides

    res.json({
      directDistance: directDistance / 1000, // Convert to km
      directPrice,
      sharedPrice,
      potentialMatches,
      estimatedPickupWindow: data.maxWaitMinutes,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Book a shared ride
export const bookSharedRide = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = bookSharedRideSchema.parse(req.body)

    // Geocode pickup and dropoff
    const [pickupGeo, dropoffGeo] = await Promise.all([
      geocodingClient.forwardGeocode({ query: data.pickupAddress }).send(),
      geocodingClient.forwardGeocode({ query: data.dropoffAddress }).send(),
    ])

    const pickupFeature = pickupGeo.body.features[0]
    const dropoffFeature = dropoffGeo.body.features[0]
    if (!pickupFeature || !dropoffFeature) {
      return res.status(400).json({ error: "Invalid address" })
    }

    // Create locations
    const [pickupLocation, dropoffLocation] = await prisma.$transaction([
      prisma.location.create({
        data: {
          latitude: pickupFeature.center[1],
          longitude: pickupFeature.center[0],
          address: pickupFeature.place_name,
          city: pickupFeature.context.find((c: any) => c.id.includes("place"))?.text || "",
          country: pickupFeature.context.find((c: any) => c.id.includes("country"))?.text || "",
          placeId: pickupFeature.id,
        },
      }),
      prisma.location.create({
        data: {
          latitude: dropoffFeature.center[1],
          longitude: dropoffFeature.center[0],
          address: dropoffFeature.place_name,
          city: dropoffFeature.context.find((c: any) => c.id.includes("place"))?.text || "",
          country: dropoffFeature.context.find((c: any) => c.id.includes("country"))?.text || "",
          placeId: dropoffFeature.id,
        },
      }),
    ])

    // Calculate direct distance
    const directDistance = getDistance(
      { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
      { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude },
    )

    // Find or create a shared ride group
    let sharedRideGroup
    let isNewGroup = false

    // Try to find a matching group
    const timeWindow = data.scheduledTime ? new Date(data.scheduledTime).getTime() : Date.now()
    const maxTimeWindow = timeWindow + data.maxWaitMinutes * 60 * 1000
    const maxDetourDistance = directDistance * (1 + data.maxDetourPercent / 100)

    const activeGroups = await prisma.sharedRideGroup.findMany({
      where: {
        status: { in: ["REQUESTED", "SEARCHING_DRIVER"] },
        createdAt: { gte: new Date(timeWindow - 30 * 60 * 1000) },
        currentCapacity: { lt: 4 - data.passengerCount },
      },
      include: {
        route: {
          include: {
            originLocation: true,
            destinationLocation: true,
          },
        },
      },
    })

    // Find best matching group
    let bestGroup = null
    let minDetour = Number.POSITIVE_INFINITY

    for (const group of activeGroups) {
      const groupOrigin = {
        latitude: group.route.originLocation.latitude,
        longitude: group.route.originLocation.longitude,
      }
      const groupDestination = {
        latitude: group.route.destinationLocation.latitude,
        longitude: group.route.destinationLocation.longitude,
      }

      // Calculate detours
      const pickupDetour = getDistance(groupOrigin, {
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
      })
      const dropoffDetour = getDistance(groupDestination, {
        latitude: dropoffLocation.latitude,
        longitude: dropoffLocation.longitude,
      })

      const totalDetour = pickupDetour + dropoffDetour
      if (totalDetour <= maxDetourDistance && totalDetour < minDetour) {
        minDetour = totalDetour
        bestGroup = group
      }
    }

    if (bestGroup) {
      // Join existing group
      sharedRideGroup = await prisma.sharedRideGroup.update({
        where: { id: bestGroup.id },
        data: {
          currentCapacity: { increment: data.passengerCount },
        },
      })
    } else {
      // Create new route
      const route = await prisma.route.create({
        data: {
          originLocationId: pickupLocation.id,
          destinationLocationId: dropoffLocation.id,
          distance: directDistance,
          estimatedTime: Math.ceil(directDistance / 500), // Rough estimate: 500m per minute
          polyline: "", // Would be populated with actual route polyline
        },
      })

      // Create new shared ride group
      sharedRideGroup = await prisma.sharedRideGroup.create({
        data: {
          routeId: route.id,
          maxCapacity: 4,
          currentCapacity: data.passengerCount,
          status: "SEARCHING_DRIVER",
        },
      })
      isNewGroup = true
    }

    // Calculate price with discount
    const basePrice = 5 + directDistance * 0.001 // Base price + per km
    const discount = Math.min(40, 10 * sharedRideGroup.currentCapacity) // 10% per passenger, max 40%
    const finalPrice = basePrice * (1 - discount / 100)

    // Create service
    const service = await prisma.service.create({
      data: {
        userId,
        serviceTypeId: data.serviceTypeId,
        status: "REQUESTED",
        pickupLocationId: pickupLocation.id,
        dropoffLocationId: dropoffLocation.id,
        passengerCount: data.passengerCount,
        estimatedPrice: finalPrice,
        scheduledTime: data.scheduledTime ? new Date(data.scheduledTime) : undefined,
        isSharingEnabled: true,
        maxSharedRiders: 4,
        sharedRideGroupId: sharedRideGroup.id,
      },
      include: {
        pickupLocation: true,
        dropoffLocation: true,
        serviceType: true,
        sharedRideGroup: true,
      },
    })

    // Create payment
    await prisma.payment.create({
      data: {
        serviceId: service.id,
        userId,
        amount: finalPrice,
        paymentMethod: "CASH", // Default to cash
        status: "PENDING",
      },
    })

    // If new group, try to find a driver
    if (isNewGroup) {
      // Find available driver (simplified)
      const availableDrivers = await prisma.driverProfile.findMany({
        where: {
          currentStatus: "ONLINE",
          approvalStatus: "APPROVED",
          assignedDriverTypes: { some: { serviceTypeId: data.serviceTypeId } },
          currentLocationId: { not: null },
        },
        include: { currentLocation: true },
        take: 1,
      })

      if (availableDrivers.length > 0) {
        const driver = availableDrivers[0]
        await prisma.service.update({
          where: { id: service.id },
          data: {
            driverId: driver.id,
            status: "DRIVER_ACCEPTED",
          },
        })

        await prisma.sharedRideGroup.update({
          where: { id: sharedRideGroup.id },
          data: { status: "DRIVER_ACCEPTED" },
        })

        await prisma.driverProfile.update({
          where: { id: driver.id },
          data: { currentStatus: "ON_TRIP" },
        })

        // Emit socket event
        ;(req as any).io
          .to(`service:${service.id}`)
          .emit("service:driver_assigned", { serviceId: service.id, driverId: driver.id })
        ;(req as any).io
          .to(`shared_ride:${sharedRideGroup.id}`)
          .emit("shared_ride:driver_assigned", { groupId: sharedRideGroup.id, driverId: driver.id })
      }
    }
    // Emit socket event for group update
    ;(req as any).io.to(`shared_ride:${sharedRideGroup.id}`).emit("shared_ride:group_update", {
      groupId: sharedRideGroup.id,
      currentCapacity: sharedRideGroup.currentCapacity,
      newService: service.id,
    })

    res.status(201).json({
      service,
      sharedRideGroup,
      isNewGroup,
      discount,
      finalPrice,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get shared ride details
export const getSharedRideDetails = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: { id, userId },
      include: {
        pickupLocation: true,
        dropoffLocation: true,
        serviceType: true,
        driver: true,
        payment: true,
        sharedRideGroup: {
          include: {
            services: {
              include: {
                pickupLocation: true,
                dropoffLocation: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    profileImage: true,
                  },
                },
              },
            },
            route: true,
          },
        },
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Service not found" })
    }

    if (!service.isSharingEnabled || !service.sharedRideGroup) {
      return res.status(400).json({ error: "Not a shared ride" })
    }

    res.json(service)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Check shared ride group status
export const checkGroupStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: { id, userId },
      include: { sharedRideGroup: true },
    })

    if (!service || !service.sharedRideGroup) {
      return res.status(404).json({ error: "Shared ride not found" })
    }

    const group = await prisma.sharedRideGroup.findUnique({
      where: { id: service.sharedRideGroupId! },
      include: {
        services: {
          select: {
            id: true,
            status: true,
            passengerCount: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    })

    res.json(group)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Leave a shared ride group
export const leaveSharedRide = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: { id, userId },
      include: { sharedRideGroup: true },
    })

    if (!service || !service.sharedRideGroup) {
      return res.status(404).json({ error: "Shared ride not found" })
    }

    // Only allow leaving if ride hasn't started
    if (!["REQUESTED", "SEARCHING_DRIVER", "DRIVER_ACCEPTED"].includes(service.status)) {
      return res.status(400).json({ error: "Cannot leave an active ride" })
    }

    const groupId = service.sharedRideGroupId!
    const passengerCount = service.passengerCount || 1

    // Update group capacity
    await prisma.sharedRideGroup.update({
      where: { id: groupId },
      data: {
        currentCapacity: {
          decrement: passengerCount,
        },
      },
    })

    // Cancel the service
    await prisma.service.update({
      where: { id },
      data: {
        status: "CANCELLED",
        sharedRideGroupId: null,
      },
    })

    // Check if group is now empty
    const updatedGroup = await prisma.sharedRideGroup.findUnique({
      where: { id: groupId },
      include: { services: true },
    })

    if (updatedGroup && updatedGroup.currentCapacity <= 0) {
      // Delete empty group
      await prisma.sharedRideGroup.delete({
        where: { id: groupId },
      })
    } else {
      // Emit socket event for group update
      ;(req as any).io.to(`shared_ride:${groupId}`).emit("shared_ride:group_update", {
        groupId,
        currentCapacity: updatedGroup?.currentCapacity,
        removedService: id,
      })
    }

    res.json({ message: "Successfully left shared ride" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
