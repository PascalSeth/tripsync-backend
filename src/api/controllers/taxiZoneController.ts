//taxiZoneController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createTaxiZoneSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  boundaries: z.string().optional(), // GeoJSON polygon data
  basePrice: z.number().positive(),
})

export const updateTaxiZoneSchema = createTaxiZoneSchema.partial()

// Taxi Zone Management
export const createTaxiZone = async (req: Request, res: Response) => {
  try {
    const data = createTaxiZoneSchema.parse(req.body)

    const taxiZone = await prisma.taxiZone.create({
      data,
    })

    res.status(201).json(taxiZone)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getTaxiZones = async (req: Request, res: Response) => {
  try {
    const taxiZones = await prisma.taxiZone.findMany({
      orderBy: { name: "asc" },
    })

    // Get service counts for each zone
    const zonesWithCounts = await Promise.all(
      taxiZones.map(async (zone) => {
        const [originServicesCount, destinationServicesCount] = await Promise.all([
          prisma.service.count({
            where: { originZoneId: zone.id },
          }),
          prisma.service.count({
            where: { destinationZoneId: zone.id },
          }),
        ])

        return {
          ...zone,
          _count: {
            originServices: originServicesCount,
            destinationServices: destinationServicesCount,
            totalServices: originServicesCount + destinationServicesCount,
          },
        }
      }),
    )

    res.json(zonesWithCounts)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getTaxiZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const taxiZone = await prisma.taxiZone.findUnique({
      where: { id },
    });

    if (!taxiZone) {
      return res.status(404).json({ error: "Taxi zone not found" });
    }

    // Get service counts
    const [originServicesCount, destinationServicesCount] = await Promise.all([
      prisma.service.count({
        where: { originZoneId: id },
      }),
      prisma.service.count({
        where: { destinationZoneId: id },
      }),
    ]);

    // Get active drivers in this zone
    const activeDriversCount = await prisma.driverProfile.count({
      where: {
        currentStatus: "ONLINE",
        currentLocation: {
          is: {
            OR: [
              {
                pickupServices: {
                  some: {
                    OR: [{ originZoneId: id }, { destinationZoneId: id }],
                    status: {
                      in: ["DRIVER_ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"],
                    },
                  },
                },
              },
              {
                dropoffServices: {
                  some: {
                    OR: [{ originZoneId: id }, { destinationZoneId: id }],
                    status: {
                      in: ["DRIVER_ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"],
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });

    // Get recent services in this zone
    const recentServices = await prisma.service.findMany({
      where: {
        OR: [{ originZoneId: id }, { destinationZoneId: id }],
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
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
        serviceType: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.json({
      ...taxiZone,
      _count: {
        originServices: originServicesCount,
        destinationServices: destinationServicesCount,
        totalServices: originServicesCount + destinationServicesCount,
        activeDrivers: activeDriversCount,
      },
      recentServices,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateTaxiZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateTaxiZoneSchema.parse(req.body)

    // Check if taxi zone exists
    const taxiZone = await prisma.taxiZone.findUnique({
      where: { id },
    })

    if (!taxiZone) {
      return res.status(404).json({ error: "Taxi zone not found" })
    }

    const updatedTaxiZone = await prisma.taxiZone.update({
      where: { id },
      data,
    })

    res.json(updatedTaxiZone)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteTaxiZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if zone is in use by services
    const [originServicesCount, destinationServicesCount] = await Promise.all([
      prisma.service.count({
        where: { originZoneId: id },
      }),
      prisma.service.count({
        where: { destinationZoneId: id },
      }),
    ])

    if (originServicesCount > 0 || destinationServicesCount > 0) {
      return res.status(400).json({
        error: "Cannot delete taxi zone that is in use by services",
        originServicesCount,
        destinationServicesCount,
      })
    }

    await prisma.taxiZone.delete({
      where: { id },
    })

    res.json({ message: "Taxi zone deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Zone Performance Analytics
export const getTaxiZoneAnalytics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { period = "week" } = req.query

    // Check if zone exists
    const taxiZone = await prisma.taxiZone.findUnique({
      where: { id },
    })

    if (!taxiZone) {
      return res.status(404).json({ error: "Taxi zone not found" })
    }

    // Get date range based on period
    const today = new Date()
    let startDate: Date

    switch (period) {
      case "day":
        startDate = new Date(today.setHours(0, 0, 0, 0))
        break
      case "week":
        startDate = new Date(today.setDate(today.getDate() - 7))
        break
      case "month":
        startDate = new Date(today.setMonth(today.getMonth() - 1))
        break
      case "year":
        startDate = new Date(today.setFullYear(today.getFullYear() - 1))
        break
      default:
        startDate = new Date(today.setDate(today.getDate() - 7))
    }

    // Get services in this zone
    const services = await prisma.service.findMany({
      where: {
        OR: [{ originZoneId: id }, { destinationZoneId: id }],
        createdAt: {
          gte: startDate,
        },
      },
      include: {
        serviceType: true,
        payment: true,
      },
    })

    // Calculate metrics
    const totalServices = services.length
    const originServices = services.filter((s) => s.originZoneId === id).length
    const destinationServices = services.filter((s) => s.destinationZoneId === id).length

    const completedServices = services.filter((s) => s.status === "COMPLETED").length
    const cancelledServices = services.filter((s) => s.status === "CANCELLED").length
    const completionRate = totalServices > 0 ? completedServices / totalServices : 0

    const totalRevenue = services.reduce(
      (sum, service) => sum + (service.payment?.amount || service.finalPrice || service.estimatedPrice || 0),
      0,
    )

    // Get service type breakdown
    const serviceTypeBreakdown = services.reduce(
      (acc, service) => {
        const category = service.serviceType.name
        if (!acc[category]) {
          acc[category] = {
            count: 0,
            revenue: 0,
          }
        }
        acc[category].count += 1
        acc[category].revenue += service.payment?.amount || service.finalPrice || service.estimatedPrice || 0
        return acc
      },
      {} as Record<string, { count: number; revenue: number }>,
    )

    // Get daily service counts
    const dailyServiceCounts = services.reduce(
      (acc, service) => {
        const date = new Date(service.createdAt).toISOString().split("T")[0]
        if (!acc[date]) {
          acc[date] = {
            date,
            count: 0,
            revenue: 0,
          }
        }
        acc[date].count += 1
        acc[date].revenue += service.payment?.amount || service.finalPrice || service.estimatedPrice || 0
        return acc
      },
      {} as Record<string, { date: string; count: number; revenue: number }>,
    )

    const dailyServiceCountsArray = Object.values(dailyServiceCounts).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )

    res.json({
      zone: {
        id: taxiZone.id,
        name: taxiZone.name,
        basePrice: taxiZone.basePrice,
      },
      metrics: {
        totalServices,
        originServices,
        destinationServices,
        completedServices,
        cancelledServices,
        completionRate,
        totalRevenue,
      },
      serviceTypeBreakdown,
      dailyServiceCounts: dailyServiceCountsArray,
      period,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
