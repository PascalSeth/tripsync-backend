//Service Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import { geocodingClient } from "../../config/mapbox"
import type { Request, Response, NextFunction } from "express"
import { getDistance } from "geolib"

// Schemas
export const requestRideSchema = z.object({
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  passengerCount: z.number().min(1).max(4),
  serviceTypeId: z.string().uuid(),
})

export const acceptRideSchema = z.object({
  serviceId: z.string().uuid(),
})

export const updateServiceStatusSchema = z.object({
  serviceId: z.string().uuid(),
  status: z.enum(["REQUESTED", "DRIVER_ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
})

export const updateDriverLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
})

// Middleware to verify driver
export const driverOnly = async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).auth?.userId
  const driver = await prisma.driverProfile.findUnique({ where: { userId } })
  if (!driver || driver.approvalStatus !== "APPROVED") {
    return res.status(403).json({ error: "Driver access required" })
  }
  ;(req as any).driver = driver
  next()
}

// Request a ride with driver matching
export const requestRide = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = requestRideSchema.parse(req.body)

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

    // Find nearest available driver
    const drivers = await prisma.driverProfile.findMany({
      where: {
        currentStatus: "ONLINE",
        approvalStatus: "APPROVED",
        assignedDriverTypes: { some: { serviceTypeId: data.serviceTypeId } },
        currentLocationId: { not: null },
      },
      include: { currentLocation: true },
    })

    let nearestDriver = null
    let minDistance = Number.POSITIVE_INFINITY
    for (const driver of drivers) {
      if (driver.currentLocation) {
        const distance = getDistance(
          { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
          { latitude: driver.currentLocation.latitude, longitude: driver.currentLocation.longitude },
        )
        if (distance < minDistance) {
          minDistance = distance
          nearestDriver = driver
        }
      }
    }

    // Calculate estimated price
    const serviceType = await prisma.serviceType.findUnique({ where: { id: data.serviceTypeId } })
    const estimatedPrice = serviceType?.basePrice || 10.0

    // Create service
    const service = await prisma.service.create({
      data: {
        userId,
        serviceTypeId: data.serviceTypeId,
        status: nearestDriver ? "DRIVER_ACCEPTED" : "REQUESTED",
        pickupLocationId: pickupLocation.id,
        dropoffLocationId: dropoffLocation.id,
        passengerCount: data.passengerCount,
        driverId: nearestDriver?.id,
        estimatedPrice,
      },
      include: { pickupLocation: true, dropoffLocation: true, serviceType: true },
    })

    // Create payment
    await prisma.payment.create({
      data: {
        serviceId: service.id,
        userId,
        amount: service.estimatedPrice || 10.0,
        paymentMethod: "CASH",
        status: "PENDING",
      },
    })

    if (nearestDriver) {
      await prisma.driverProfile.update({
        where: { id: nearestDriver.id },
        data: { currentStatus: "ON_TRIP" },
      })
      ;(req as any).io
        .to(`service:${service.id}`)
        .emit("service:driver_assigned", { serviceId: service.id, driverId: nearestDriver.id })
    }

    res.status(201).json(service)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Driver accepts a ride (manual fallback)
export const acceptRide = async (req: Request, res: Response) => {
  try {
    const driver = (req as any).driver
    const data = acceptRideSchema.parse(req.body)

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
      include: { serviceType: true },
    })
    if (!service || service.status !== "REQUESTED") {
      return res.status(400).json({ error: "Invalid or unavailable service" })
    }

    // Verify driver is assigned to the service type
    const assigned = await prisma.assignedDriverType.findFirst({
      where: { driverProfileId: driver.id, serviceTypeId: service.serviceTypeId },
    })
    if (!assigned) {
      return res.status(403).json({ error: "Not authorized for this service type" })
    }

    const updatedService = await prisma.service.update({
      where: { id: data.serviceId },
      data: {
        driverId: driver.id,
        status: "DRIVER_ACCEPTED",
      },
      include: { pickupLocation: true, dropoffLocation: true, serviceType: true },
    })

    await prisma.driverProfile.update({
      where: { id: driver.id },
      data: { currentStatus: "ON_TRIP" },
    })
    ;(req as any).io
      .to(`service:${updatedService.id}`)
      .emit("service:driver_assigned", { serviceId: updatedService.id, driverId: driver.id })

    res.json(updatedService)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Update service status
export const updateServiceStatus = async (req: Request, res: Response) => {
  try {
    const driver = (req as any).driver
    const data = updateServiceStatusSchema.parse(req.body)

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
    })
    if (!service || service.driverId !== driver.id) {
      return res.status(403).json({ error: "Not authorized" })
    }

    const updatedService = await prisma.service.update({
      where: { id: data.serviceId },
      data: {
        status: data.status,
        startTime: data.status === "IN_PROGRESS" ? new Date() : undefined,
        endTime: data.status === "COMPLETED" ? new Date() : undefined,
      },
      include: { pickupLocation: true, dropoffLocation: true, serviceType: true },
    })

    if (data.status === "COMPLETED") {
      await prisma.driverProfile.update({
        where: { id: driver.id },
        data: { currentStatus: "ONLINE" },
      })
    }
    ;(req as any).io
      .to(`service:${updatedService.id}`)
      .emit(`service:${data.status.toLowerCase()}`, { serviceId: updatedService.id })

    res.json(updatedService)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Update driver location
export const updateDriverLocation = async (req: Request, res: Response) => {
  try {
    const driver = (req as any).driver
    const data = updateDriverLocationSchema.parse(req.body)

    const location = await prisma.location.upsert({
      where: { id: driver.currentLocationId || "" },
      update: { latitude: data.latitude, longitude: data.longitude },
      create: {
        latitude: data.latitude,
        longitude: data.longitude,
        address: "Driver Location",
        city: "",
        country: "",
      },
    })

    await prisma.driverProfile.update({
      where: { id: driver.id },
      data: { currentLocationId: location.id },
    })
    ;(req as any).io.to(`service:${driver.id}`).emit("service:location_update", {
      driverId: driver.id,
      latitude: data.latitude,
      longitude: data.longitude,
    })

    res.json({ message: "Location updated" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get service history
export const getServiceHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const services = await prisma.service.findMany({
      where: { userId },
      include: {
        pickupLocation: true,
        dropoffLocation: true,
        serviceType: true,
        driver: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    })
    res.json(services)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get service details
export const getService = async (req: Request, res: Response) => {
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
      },
    })
    if (!service) {
      return res.status(404).json({ error: "Service not found" })
    }
    res.json(service)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
