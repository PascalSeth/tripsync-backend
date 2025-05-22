//House Moving Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import { geocodingClient } from "../../config/mapbox"
import type { Request, Response } from "express"
import { getDistance } from "geolib"

// Schemas
export const estimateMovingSchema = z.object({
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  moveDate: z.string().datetime(),
  inventoryItems: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      quantity: z.number().int().positive(),
      specialHandling: z.boolean().optional().default(false),
    }),
  ),
  vehicleSize: z.string().optional(),
  requiresHelpers: z.boolean().optional().default(false),
  helpersCount: z.number().int().min(0).max(5).optional().default(0),
})

export const bookMovingSchema = z.object({
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  moveDate: z.string().datetime(),
  inventoryItems: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      quantity: z.number().int().positive(),
      specialHandling: z.boolean().optional().default(false),
      specialInstructions: z.string().optional(),
    }),
  ),
  vehicleSize: z.string(),
  requiresHelpers: z.boolean().optional().default(false),
  helpersCount: z.number().int().min(0).max(5).optional().default(0),
  specialInstructions: z.string().optional(),
  movingCompanyId: z.string().optional(),
  paymentMethod: z.enum(["CREDIT_CARD", "DEBIT_CARD", "MOBILE_MONEY", "BANK_TRANSFER", "CASH"]),
})

export const updateInventorySchema = z.object({
  inventoryItems: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string(),
      category: z.string(),
      quantity: z.number().int().positive(),
      specialHandling: z.boolean().optional().default(false),
      specialInstructions: z.string().optional(),
    }),
  ),
})

export const updateMovingStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "LOADING", "IN_TRANSIT", "UNLOADING", "COMPLETED", "CANCELLED"]),
  notes: z.string().optional(),
})

// Get available moving companies
export const getMovingCompanies = async (req: Request, res: Response) => {
  try {
    const { lat, lng } = req.query

    let companies

    if (lat && lng) {
      // If coordinates provided, find companies and calculate distance
      const latitude = Number.parseFloat(lat as string)
      const longitude = Number.parseFloat(lng as string)

      companies = await prisma.movingCompany.findMany({
        where: { isActive: true },
        include: { currentLocation: true },
      })

      // Calculate distance for each company
      companies = companies
        .map((company) => {
          let distance = null
          if (company.currentLocation) {
            distance =
              getDistance(
                { latitude, longitude },
                { latitude: company.currentLocation.latitude, longitude: company.currentLocation.longitude },
              ) / 1000 // Convert to km
          }
          return { ...company, distance }
        })
        .sort((a, b) => {
          if (a.distance === null) return 1
          if (b.distance === null) return -1
          return a.distance - b.distance
        })
    } else {
      // Otherwise just return all active companies
      companies = await prisma.movingCompany.findMany({
        where: { isActive: true },
      })
    }

    res.json(companies)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Estimate moving cost
export const estimateMovingCost = async (req: Request, res: Response) => {
  try {
    const data = estimateMovingSchema.parse(req.body)

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

    // Calculate distance
    const distance =
      getDistance(
        { latitude: pickupFeature.center[1], longitude: pickupFeature.center[0] },
        { latitude: dropoffFeature.center[1], longitude: dropoffFeature.center[0] },
      ) / 1000 // Convert to km

    // Calculate estimated volume based on inventory items
    const estimatedVolume = calculateEstimatedVolume(data.inventoryItems)

    // Calculate base price
    const basePrice = 50 // Base fee
    const distancePrice = distance * 2 // $2 per km
    const volumePrice = estimatedVolume * 10 // $10 per cubic meter
    const helpersPrice = data.requiresHelpers ? data.helpersCount * 25 : 0 // $25 per helper
    const specialHandlingPrice = data.inventoryItems.filter((item) => item.specialHandling).length * 15 // $15 per special item

    // Calculate total
    const subtotal = basePrice + distancePrice + volumePrice + helpersPrice + specialHandlingPrice
    const tax = subtotal * 0.05 // 5% tax
    const total = subtotal + tax

    // Estimate duration
    const loadingTime = Math.ceil(estimatedVolume / 2) * 60 // 30 minutes per cubic meter for loading
    const travelTime = Math.ceil(distance / 40) * 60 // Assuming 40km/h average speed
    const unloadingTime = Math.ceil(estimatedVolume / 3) * 60 // 20 minutes per cubic meter for unloading
    const totalMinutes = loadingTime + travelTime + unloadingTime

    // Format duration
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const formattedDuration = `${hours}h ${minutes}m`

    res.json({
      distance,
      estimatedVolume,
      pricing: {
        basePrice,
        distancePrice,
        volumePrice,
        helpersPrice,
        specialHandlingPrice,
        subtotal,
        tax,
        total,
      },
      estimatedDuration: {
        loadingTime: Math.ceil(loadingTime / 60) + "h",
        travelTime: Math.ceil(travelTime / 60) + "h",
        unloadingTime: Math.ceil(unloadingTime / 60) + "h",
        total: formattedDuration,
        totalMinutes,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Book moving service
export const bookMovingService = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = bookMovingSchema.parse(req.body)

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
          state: pickupFeature.context.find((c: any) => c.id.includes("region"))?.text || "",
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
          state: dropoffFeature.context.find((c: any) => c.id.includes("region"))?.text || "",
          placeId: dropoffFeature.id,
        },
      }),
    ])

    // Calculate distance
    const distance =
      getDistance(
        { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
        { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude },
      ) / 1000 // Convert to km

    // Create route
    const route = await prisma.route.create({
      data: {
        originLocationId: pickupLocation.id,
        destinationLocationId: dropoffLocation.id,
        distance,
        estimatedTime: Math.ceil(distance / 40) * 60, // Assuming 40km/h average speed, in minutes
        polyline: "", // Would be populated with actual route polyline
      },
    })

    // Get house moving service type
    const serviceType = await prisma.serviceType.findFirst({
      where: { category: "HOUSE_MOVING" },
    })

    if (!serviceType) {
      return res.status(400).json({ error: "House moving service type not found" })
    }

    // Calculate estimated volume and price
    const estimatedVolume = calculateEstimatedVolume(data.inventoryItems)
    const basePrice = 50 // Base fee
    const distancePrice = distance * 2 // $2 per km
    const volumePrice = estimatedVolume * 10 // $10 per cubic meter
    const helpersPrice = data.requiresHelpers ? data.helpersCount * 25 : 0 // $25 per helper
    const specialHandlingPrice = data.inventoryItems.filter((item) => item.specialHandling).length * 15 // $15 per special item
    const subtotal = basePrice + distancePrice + volumePrice + helpersPrice + specialHandlingPrice
    const tax = subtotal * 0.05 // 5% tax
    const total = subtotal + tax

    // Generate tracking code
    const trackingCode = generateTrackingCode()

    // Create service
    const service = await prisma.service.create({
      data: {
        userId,
        serviceTypeId: serviceType.id,
        status: "SCHEDULED",
        pickupLocationId: pickupLocation.id,
        dropoffLocationId: dropoffLocation.id,
        scheduledTime: new Date(data.moveDate),
        notes: data.specialInstructions,
        estimatedPrice: total,
        estimatedDistance: distance,
        estimatedDuration: Math.ceil(distance / 40) * 60, // in minutes
        vehicleSize: data.vehicleSize,
        trackingCode,
        movingCompanyId: data.movingCompanyId,
      },
    })

    // Create inventory items
    const inventoryItems = await Promise.all(
      data.inventoryItems.map((item) =>
        prisma.moveInventoryItem.create({
          data: {
            serviceId: service.id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            specialHandling: item.specialHandling,
            specialInstructions: item.specialInstructions,
          },
        }),
      ),
    )

    // Create payment
    await prisma.payment.create({
      data: {
        serviceId: service.id,
        userId,
        amount: total,
        paymentMethod: data.paymentMethod,
        status: "PENDING",
      },
    })

    // If moving company is specified, notify them
    if (data.movingCompanyId) {
      // In a real implementation, you would send a notification to the moving company
      // For now, we'll just update the service status
      await prisma.service.update({
        where: { id: service.id },
        data: { status: "CONFIRMED" },
      })
    }

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId,
        title: "Moving Service Booked",
        body: `Your moving service has been booked for ${new Date(data.moveDate).toLocaleDateString()}. Tracking code: ${trackingCode}`,
        type: "SERVICE_UPDATE",
        data: JSON.stringify({ serviceId: service.id }),
      },
    })

    res.status(201).json({
      service,
      inventoryItems,
      trackingCode,
      pricing: {
        basePrice,
        distancePrice,
        volumePrice,
        helpersPrice,
        specialHandlingPrice,
        subtotal,
        tax,
        total,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get moving service details
export const getMovingServiceDetails = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: {
        id,
        userId,
        serviceType: {
          category: "HOUSE_MOVING",
        },
      },
      include: {
        pickupLocation: true,
        dropoffLocation: true,
        movingCompany: true,
        inventoryItems: true,
        payment: true,
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Moving service not found" })
    }

    res.json(service)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Update inventory items
export const updateInventoryItems = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params
    const data = updateInventorySchema.parse(req.body)

    // Check if service exists and belongs to user
    const service = await prisma.service.findUnique({
      where: {
        id,
        userId,
        serviceType: {
          category: "HOUSE_MOVING",
        },
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Moving service not found" })
    }

    // Only allow updates if service is not in progress
    if (!["SCHEDULED", "CONFIRMED"].includes(service.status)) {
      return res.status(400).json({ error: "Cannot update inventory for a service in progress" })
    }

    // Get existing inventory items
    const existingItems = await prisma.moveInventoryItem.findMany({
      where: { serviceId: id },
    })

    // Process updates
    const itemsToCreate = data.inventoryItems.filter((item) => !item.id)
    const itemsToUpdate = data.inventoryItems.filter((item) => item.id)
    const existingIds = new Set(itemsToUpdate.map((item) => item.id))
    const itemsToDelete = existingItems.filter((item) => !existingIds.has(item.id))

    // Create new items
    const createdItems = await Promise.all(
      itemsToCreate.map((item) =>
        prisma.moveInventoryItem.create({
          data: {
            serviceId: id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            specialHandling: item.specialHandling,
            specialInstructions: item.specialInstructions,
          },
        }),
      ),
    )

    // Update existing items
    const updatedItems = await Promise.all(
      itemsToUpdate.map((item) =>
        prisma.moveInventoryItem.update({
          where: { id: item.id },
          data: {
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            specialHandling: item.specialHandling,
            specialInstructions: item.specialInstructions,
          },
        }),
      ),
    )

    // Delete removed items
    if (itemsToDelete.length > 0) {
      await prisma.moveInventoryItem.deleteMany({
        where: {
          id: { in: itemsToDelete.map((item) => item.id) },
        },
      })
    }

    // Recalculate price based on updated inventory
    const allItems = [...createdItems, ...updatedItems]
    const estimatedVolume = calculateEstimatedVolume(
      allItems.map((item) => ({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        specialHandling: item.specialHandling,
      })),
    )

    // Get distance
    const distance = service.estimatedDistance || 0

    // Calculate new price
    const basePrice = 50 // Base fee
    const distancePrice = distance * 2 // $2 per km
    const volumePrice = estimatedVolume * 10 // $10 per cubic meter
    const helpersPrice = 0 // We don't have this info in the update, so keep it at 0
    const specialHandlingPrice = allItems.filter((item) => item.specialHandling).length * 15 // $15 per special item
    const subtotal = basePrice + distancePrice + volumePrice + helpersPrice + specialHandlingPrice
    const tax = subtotal * 0.05 // 5% tax
    const total = subtotal + tax

    // Update service with new price
    await prisma.service.update({
      where: { id },
      data: {
        estimatedPrice: total,
      },
    })

    // Update payment if it exists and is still pending
    const payment = await prisma.payment.findUnique({
      where: { serviceId: id },
    })

    if (payment && payment.status === "PENDING") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          amount: total,
        },
      })
    }

    res.json({
      items: [...createdItems, ...updatedItems],
      deleted: itemsToDelete.length,
      pricing: {
        basePrice,
        distancePrice,
        volumePrice,
        helpersPrice,
        specialHandlingPrice,
        subtotal,
        tax,
        total,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Track moving service
export const trackMovingService = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: {
        id,
        userId,
        serviceType: {
          category: "HOUSE_MOVING",
        },
      },
      include: {
        pickupLocation: true,
        dropoffLocation: true,
        movingCompany: true,
        driver: {
          include: {
            currentLocation: true,
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
    })

    if (!service) {
      return res.status(404).json({ error: "Moving service not found" })
    }

    // Calculate progress percentage based on status
    let progressPercentage = 0
    switch (service.status) {
      case "SCHEDULED":
        progressPercentage = 0
        break
      case "CONFIRMED":
        progressPercentage = 10
        break
      case "LOADING":
        progressPercentage = 30
        break
      case "IN_TRANSIT":
        progressPercentage = 60
        break
      case "UNLOADING":
        progressPercentage = 90
        break
      case "COMPLETED":
        progressPercentage = 100
        break
      default:
        progressPercentage = 0
    }

    // Calculate ETA if in transit
    let eta = null
    if (service.status === "IN_TRANSIT" && service.driver?.currentLocation) {
      const currentLocation = service.driver.currentLocation
      const dropoffLocation = service.dropoffLocation

      if (dropoffLocation) {
        const remainingDistance =
          getDistance(
            { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
            { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude },
          ) / 1000 // Convert to km

        // Assuming average speed of 40 km/h
        const remainingTimeMinutes = Math.ceil((remainingDistance / 40) * 60)
        eta = new Date(Date.now() + remainingTimeMinutes * 60 * 1000)
      }
    }

    res.json({
      service,
      tracking: {
        status: service.status,
        progressPercentage,
        eta,
        trackingCode: service.trackingCode,
        lastUpdated: service.updatedAt,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Update moving status (driver only)
export const updateMovingStatus = async (req: Request, res: Response) => {
  try {
    const driver = (req as any).driver
    const { id } = req.params
    const data = updateMovingStatusSchema.parse(req.body)

    // Check if service exists and is assigned to this driver
    const service = await prisma.service.findUnique({
      where: {
        id,
        driverId: driver.id,
        serviceType: {
          category: "HOUSE_MOVING",
        },
      },
      include: {
        pickupLocation: true,
        dropoffLocation: true,
        user: true,
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Moving service not found or not assigned to you" })
    }

    // Update service status
    const updatedService = await prisma.service.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes ? `${service.notes || ""}\n\nDriver: ${data.notes}` : service.notes,
        startTime: data.status === "LOADING" && !service.startTime ? new Date() : service.startTime,
        completedTime: data.status === "COMPLETED" ? new Date() : service.completedTime,
      },
    })

    // If completed, update driver status
    if (data.status === "COMPLETED") {
      await prisma.driverProfile.update({
        where: { id: driver.id },
        data: { currentStatus: "ONLINE" },
      })

      // Update payment status if cash payment
      const payment = await prisma.payment.findUnique({
        where: { serviceId: id },
      })

      if (payment && payment.paymentMethod === "CASH") {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "PAID",
            paymentDate: new Date(),
          },
        })
      }
    }

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId: service.userId,
        title: "Moving Service Update",
        body: getMovingStatusMessage(data.status),
        type: "SERVICE_UPDATE",
        data: JSON.stringify({ serviceId: service.id }),
      },
    })

    // Emit socket event
    ;(req as any).io.to(`service:${service.id}`).emit("moving:status_update", {
      serviceId: service.id,
      status: data.status,
    })

    res.json(updatedService)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Cancel moving service
export const cancelMovingService = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: {
        id,
        userId,
        serviceType: {
          category: "HOUSE_MOVING",
        },
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Moving service not found" })
    }

    // Only allow cancellation if not already in progress
    if (["LOADING", "IN_TRANSIT", "UNLOADING", "COMPLETED"].includes(service.status)) {
      return res.status(400).json({ error: "Cannot cancel a service that is already in progress" })
    }

    // Calculate cancellation fee based on how close to scheduled time
    let cancellationFee = 0
    if (service.scheduledTime) {
      const hoursUntilScheduled = (new Date(service.scheduledTime).getTime() - Date.now()) / (1000 * 60 * 60)

      if (hoursUntilScheduled < 24) {
        // Less than 24 hours notice: 50% fee
        cancellationFee = (service.estimatedPrice || 0) * 0.5
      } else if (hoursUntilScheduled < 48) {
        // Less than 48 hours notice: 25% fee
        cancellationFee = (service.estimatedPrice || 0) * 0.25
      } else if (hoursUntilScheduled < 72) {
        // Less than 72 hours notice: 10% fee
        cancellationFee = (service.estimatedPrice || 0) * 0.1
      }
    }

    // Update service status
    const updatedService = await prisma.service.update({
      where: { id },
      data: {
        status: "CANCELLED",
        completedTime: new Date(),
        finalPrice: cancellationFee,
      },
    })

    // Update payment
    const payment = await prisma.payment.findUnique({
      where: { serviceId: id },
    })

    if (payment) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          amount: cancellationFee,
          status: cancellationFee > 0 ? "PENDING" : "FAILED", // Using FAILED instead of CANCELLED as it's in the PaymentStatus enum
        },
      })
    }

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
          title: "Moving Service Cancelled",
          body: "The moving service you were assigned to has been cancelled.",
          type: "SERVICE_UPDATE",
          data: JSON.stringify({ serviceId: service.id }),
        },
      })
    }

    // Create notification for user about cancellation fee
    if (cancellationFee > 0) {
      await prisma.notification.create({
        data: {
          userId,
          title: "Cancellation Fee Applied",
          body: `A cancellation fee of $${cancellationFee.toFixed(2)} has been applied to your cancelled moving service.`,
          type: "PAYMENT",
          data: JSON.stringify({ serviceId: service.id }),
        },
      })
    }

    res.json({
      service: updatedService,
      cancellationFee,
      message: cancellationFee > 0 ? "Service cancelled with cancellation fee" : "Service cancelled successfully",
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Helper function to calculate estimated volume
function calculateEstimatedVolume(
  items: { name: string; category: string; quantity: number; specialHandling?: boolean }[],
): number {
  // This is a simplified calculation
  // In a real app, you would have a more sophisticated algorithm based on item types
  const volumeByCategory: { [key: string]: number } = {
    furniture: 0.5, // 0.5 cubic meters per furniture item
    box: 0.1, // 0.1 cubic meters per box
    appliance: 0.3, // 0.3 cubic meters per appliance
    electronics: 0.2, // 0.2 cubic meters per electronic item
  }

  return items.reduce((total, item) => {
    const categoryVolume = volumeByCategory[item.category.toLowerCase()] || 0.2 // Default to 0.2 cubic meters
    return total + categoryVolume * item.quantity
  }, 0)
}

// Helper function to generate tracking code
function generateTrackingCode(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = "MV-"
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}

// Helper function to generate status messages
function getMovingStatusMessage(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "Your moving service has been confirmed."
    case "LOADING":
      return "The movers have arrived and are loading your items."
    case "IN_TRANSIT":
      return "Your items are in transit to the destination."
    case "UNLOADING":
      return "The movers have arrived at the destination and are unloading your items."
    case "COMPLETED":
      return "Your moving service has been completed."
    case "CANCELLED":
      return "Your moving service has been cancelled."
    default:
      return `Your moving service status has been updated to ${status}.`
  }
}
