//Taxi Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import { geocodingClient } from "../../config/mapbox"
import type { Request, Response } from "express"
import { isPointInPolygon, getDistance } from "geolib"

export const bookTaxiSchema = z.object({
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  passengerCount: z.number().min(1).max(4),
  isMetered: z.boolean().optional().default(true),
})

export const bookTaxi = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = bookTaxiSchema.parse(req.body)

    // Geocode addresses
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
          country: pickupFeature.context.find((c: any) => c.id.includes("country"))?.text || "",
          placeId: dropoffFeature.id,
        },
      }),
    ])

    // Determine taxi zones
    const zones = await prisma.taxiZone.findMany()
    let pickupZone = null
    let dropoffZone = null
    for (const zone of zones) {
      if (!zone.boundaries) {
        continue // Skip zones with null boundaries
      }
      const boundaries = JSON.parse(zone.boundaries)
      if (isPointInPolygon({ latitude: pickupLocation.latitude, longitude: pickupLocation.longitude }, boundaries)) {
        pickupZone = zone
      }
      if (isPointInPolygon({ latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude }, boundaries)) {
        dropoffZone = zone
      }
    }

    // Calculate price
    let estimatedPrice = null
    if (!data.isMetered && pickupZone && dropoffZone) {
      estimatedPrice = pickupZone.basePrice + (pickupZone.id === dropoffZone.id ? 0 : dropoffZone.basePrice * 0.5)
    }

    // Find taxi service type
    const taxiType = await prisma.serviceType.findFirst({
      where: { category: "TAXI" },
    })
    if (!taxiType || !taxiType.id) {
      return res.status(400).json({ error: "Taxi service type not found" })
    }

    // Find nearest available driver
    const drivers = await prisma.driverProfile.findMany({
      where: {
        currentStatus: "ONLINE",
        approvalStatus: "APPROVED",
        assignedDriverTypes: { some: { serviceTypeId: taxiType.id } },
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

    // Create service
    const service = await prisma.service.create({
      data: {
        userId,
        serviceTypeId: taxiType.id,
        status: nearestDriver ? "DRIVER_ACCEPTED" : "REQUESTED",
        pickupLocationId: pickupLocation.id,
        dropoffLocationId: dropoffLocation.id,
        passengerCount: data.passengerCount,
        isMetered: data.isMetered,
        estimatedPrice: estimatedPrice || taxiType.basePrice,
        originZoneId: pickupZone?.id,
        destinationZoneId: dropoffZone?.id,
        driverId: nearestDriver?.id,
      },
      include: { pickupLocation: true, dropoffLocation: true, serviceType: true },
    })

    // Create payment
    await prisma.payment.create({
      data: {
        serviceId: service.id,
        userId,
        amount: service.estimatedPrice || 15.0,
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
