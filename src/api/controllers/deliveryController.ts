//Delivery Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import { geocodingClient } from "../../config/mapbox"
import { getDistance } from "geolib"

// Schemas
export const estimateDeliverySchema = z.object({
  storeId: z.string().uuid(),
  deliveryAddress: z.string(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
    }),
  ),
})

export const createDeliveryOrderSchema = z.object({
  storeId: z.string().uuid(),
  deliveryAddress: z.string(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      specialRequest: z.string().optional(),
    }),
  ),
  scheduledTime: z.string().datetime().optional(),
  paymentMethod: z.enum(["CASH", "CREDIT_CARD", "DEBIT_CARD", "MOBILE_MONEY"]),
  notes: z.string().optional(),
})

export const updateDeliveryStatusSchema = z.object({
  status: z.enum([
    "PREPARING",
    "READY_FOR_PICKUP",
    "DRIVER_ACCEPTED",
    "DRIVER_ARRIVED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ]),
})

// Estimate delivery cost and time
export const estimateDelivery = async (req: Request, res: Response) => {
  try {
    const data = estimateDeliverySchema.parse(req.body)

    // Get store details
    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
      include: { location: true },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
    }

    // Get products
    const products = await prisma.product.findMany({
      where: {
        id: { in: data.items.map((item) => item.productId) },
        storeId: data.storeId,
        inStock: true,
      },
    })

    if (products.length !== data.items.length) {
      return res.status(400).json({ error: "One or more products are unavailable" })
    }

    // Calculate subtotal
    const subtotal = data.items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId)
      return sum + (product?.price || 0) * item.quantity
    }, 0)

    // Geocode delivery address
    const geoResponse = await geocodingClient.forwardGeocode({ query: data.deliveryAddress }).send()
    const feature = geoResponse.body.features[0]
    if (!feature) {
      return res.status(400).json({ error: "Invalid delivery address" })
    }

    // Calculate distance
    const distance = getDistance(
      { latitude: store.location.latitude, longitude: store.location.longitude },
      { latitude: feature.center[1], longitude: feature.center[0] },
    )

    // Calculate delivery fee based on distance
    const distanceKm = distance / 1000
    const baseFee = 2.0 // Base delivery fee
    const perKmFee = 0.5 // Fee per km
    const deliveryFee = baseFee + distanceKm * perKmFee

    // Calculate tax
    const taxRate = 0.05 // 5% tax
    const tax = subtotal * taxRate

    // Calculate total
    const total = subtotal + deliveryFee + tax

    // Estimate delivery time
    const preparationTime = 15 // 15 minutes
    const deliveryTimePerKm = 3 // 3 minutes per km
    const estimatedDeliveryTime = preparationTime + Math.ceil(distanceKm * deliveryTimePerKm)

    res.json({
      subtotal,
      deliveryFee,
      tax,
      total,
      distance: distanceKm,
      estimatedDeliveryTime,
      items: data.items.map((item) => {
        const product = products.find((p) => p.id === item.productId)
        return {
          product,
          quantity: item.quantity,
          price: product?.price || 0,
          total: (product?.price || 0) * item.quantity,
        }
      }),
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Create a delivery order
export const createDeliveryOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = createDeliveryOrderSchema.parse(req.body)

    // Get store details
    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
      include: { location: true },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
    }

    // Get products
    const products = await prisma.product.findMany({
      where: {
        id: { in: data.items.map((item) => item.productId) },
        storeId: data.storeId,
        inStock: true,
      },
    })

    if (products.length !== data.items.length) {
      return res.status(400).json({ error: "One or more products are unavailable" })
    }

    // Calculate subtotal
    const subtotal = data.items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId)
      return sum + (product?.price || 0) * item.quantity
    }, 0)

    // Geocode delivery address
    const geoResponse = await geocodingClient.forwardGeocode({ query: data.deliveryAddress }).send()
    const feature = geoResponse.body.features[0]
    if (!feature) {
      return res.status(400).json({ error: "Invalid delivery address" })
    }

    // Create delivery location
    const deliveryLocation = await prisma.location.create({
      data: {
        latitude: feature.center[1],
        longitude: feature.center[0],
        address: feature.place_name,
        city: feature.context.find((c: any) => c.id.includes("place"))?.text || "",
        country: feature.context.find((c: any) => c.id.includes("country"))?.text || "",
        placeId: feature.id,
      },
    })

    // Calculate distance
    const distance = getDistance(
      { latitude: store.location.latitude, longitude: store.location.longitude },
      { latitude: deliveryLocation.latitude, longitude: deliveryLocation.longitude },
    )

    // Calculate delivery fee based on distance
    const distanceKm = distance / 1000
    const baseFee = 2.0 // Base delivery fee
    const perKmFee = 0.5 // Fee per km
    const deliveryFee = baseFee + distanceKm * perKmFee

    // Calculate tax
    const taxRate = 0.05 // 5% tax
    const tax = subtotal * taxRate

    // Calculate total
    const total = subtotal + deliveryFee + tax

    // Get store delivery service type
    const serviceType = await prisma.serviceType.findFirst({
      where: { category: "STORE_DELIVERY" },
    })

    if (!serviceType) {
      return res.status(400).json({ error: "Delivery service type not found" })
    }

    // Create service
    const service = await prisma.service.create({
      data: {
        userId,
        serviceTypeId: serviceType.id,
        status: "PREPARING",
        storeId: data.storeId,
        dropoffLocationId: deliveryLocation.id,
        scheduledTime: data.scheduledTime ? new Date(data.scheduledTime) : undefined,
        notes: data.notes,
        estimatedPrice: total,
        estimatedDistance: distanceKm,
        estimatedDuration: 15 + Math.ceil(distanceKm * 3), // 15 min prep + 3 min/km
      },
      include: {
        store: {
          include: { location: true },
        },
        dropoffLocation: true,
      },
    })

    // Create order items
    const orderItems = await Promise.all(
      data.items.map((item) => {
        const product = products.find((p) => p.id === item.productId)
        return prisma.orderItem.create({
          data: {
            serviceId: service.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: product?.price || 0,
            specialRequest: item.specialRequest,
          },
        })
      }),
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

    // Create notification for store
    await prisma.notification.create({
      data: {
        userId, // This would be replaced with store owner's ID in a real implementation
        title: "New Order",
        body: `New order #${service.id.slice(-6)} received`,
        type: "DELIVERY_UPDATE",
        data: JSON.stringify({ serviceId: service.id }),
      },
    })

    res.status(201).json({
      service,
      orderItems,
      subtotal,
      deliveryFee,
      tax,
      total,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get delivery details
export const getDeliveryDetails = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { id } = req.params

    const service = await prisma.service.findUnique({
      where: {
        id,
        userId,
        serviceType: {
          category: "STORE_DELIVERY",
        },
      },
      include: {
        store: {
          include: { location: true },
        },
        dropoffLocation: true,
        driver: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                profileImage: true,
              },
            },
            currentLocation: true,
          },
        },
        orderItems: {
          include: { product: true },
        },
        payment: true,
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Delivery not found" })
    }

    res.json(service)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Update delivery status
export const updateDeliveryStatus = async (req: Request, res: Response) => {
  try {
    const driver = (req as any).driver
    const { id } = req.params
    const data = updateDeliveryStatusSchema.parse(req.body)

    // Check if service exists and is a delivery
    const service = await prisma.service.findUnique({
      where: {
        id,
        serviceType: {
          category: "STORE_DELIVERY",
        },
      },
      include: {
        store: true,
        dropoffLocation: true,
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Delivery not found" })
    }

    // Check if driver is assigned to this delivery
    if (data.status !== "DRIVER_ACCEPTED" && service.driverId !== driver.id) {
      return res.status(403).json({ error: "Not authorized" })
    }

    // Handle status transitions
    const updateData: any = { status: data.status }

    if (data.status === "DRIVER_ACCEPTED" && !service.driverId) {
      // Driver accepting the delivery
      updateData.driverId = driver.id
    } else if (data.status === "DRIVER_ARRIVED") {
      // Driver arrived at store
      updateData.startTime = new Date()
    } else if (data.status === "OUT_FOR_DELIVERY") {
      // Driver picked up the order
    } else if (data.status === "DELIVERED") {
      // Delivery completed
      updateData.endTime = new Date()
      updateData.completedTime = new Date()
      updateData.finalPrice = service.estimatedPrice
    }

    // Update service
    const updatedService = await prisma.service.update({
      where: { id },
      data: updateData,
      include: {
        store: true,
        dropoffLocation: true,
        driver: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    })

    // Update driver status if needed
    if (data.status === "DRIVER_ACCEPTED") {
      await prisma.driverProfile.update({
        where: { id: driver.id },
        data: { currentStatus: "ON_TRIP" },
      })
    } else if (data.status === "DELIVERED") {
      await prisma.driverProfile.update({
        where: { id: driver.id },
        data: { currentStatus: "ONLINE" },
      })
    }

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId: service.userId,
        title: "Delivery Update",
        body: getStatusMessage(data.status, updatedService),
        type: "DELIVERY_UPDATE",
        data: JSON.stringify({ serviceId: service.id }),
      },
    })

    // Emit socket event
    ;(req as any).io.to(`service:${service.id}`).emit("service:status_update", {
      serviceId: service.id,
      status: data.status,
      driverId: updatedService.driverId,
    })

    res.json(updatedService)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Helper function to generate status messages
function getStatusMessage(status: string, service: any): string {
  switch (status) {
    case "PREPARING":
      return `Your order from ${service.store.name} is being prepared.`
    case "READY_FOR_PICKUP":
      return `Your order from ${service.store.name} is ready for pickup.`
    case "DRIVER_ACCEPTED":
      return `${service.driver.user.firstName} has accepted your delivery.`
    case "DRIVER_ARRIVED":
      return `${service.driver.user.firstName} has arrived at ${service.store.name}.`
    case "OUT_FOR_DELIVERY":
      return `${service.driver.user.firstName} is on the way with your delivery.`
    case "DELIVERED":
      return `Your order has been delivered. Enjoy!`
    case "CANCELLED":
      return `Your order has been cancelled.`
    default:
      return `Your delivery status has been updated to ${status}.`
  }
}

// Get delivery history
export const getDeliveryHistory = async (req: Request, res: Response) => {
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
            category: "STORE_DELIVERY",
          },
        },
        include: {
          store: true,
          dropoffLocation: true,
          orderItems: {
            include: { product: true },
          },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
      })
    } else {
      services = await prisma.service.findMany({
        where: {
          userId,
          serviceType: {
            category: "STORE_DELIVERY",
          },
        },
        include: {
          store: true,
          dropoffLocation: true,
          driver: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          orderItems: {
            include: { product: true },
          },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
      })
    }

    res.json(services)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
