//movingController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createMovingCompanySchema = z.object({
  name: z.string().min(2),
  contactPhone: z.string().min(5),
  contactEmail: z.string().email(),
  website: z.string().url().optional(),
  pricePerHour: z.number().positive(),
  isActive: z.boolean().optional(),
  currentLocationId: z.string().uuid().optional(),
})

export const updateMovingCompanySchema = createMovingCompanySchema.partial()

// Moving Company Management
export const createMovingCompany = async (req: Request, res: Response) => {
  try {
    const data = createMovingCompanySchema.parse(req.body)

    // Check if location exists if provided
    if (data.currentLocationId) {
      const location = await prisma.location.findUnique({
        where: { id: data.currentLocationId },
      })

      if (!location) {
        return res.status(400).json({ error: "Location not found" })
      }
    }

    const company = await prisma.movingCompany.create({
      data,
      include: {
        currentLocation: true,
      },
    })

    res.status(201).json(company)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getMovingCompanies = async (req: Request, res: Response) => {
  try {
    const { isActive } = req.query

    const whereClause: any = {}

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    const companies = await prisma.movingCompany.findMany({
      where: whereClause,
      include: {
        currentLocation: true,
        _count: {
          select: {
            services: true,
          },
        },
      },
      orderBy: { name: "asc" },
    })

    res.json(companies)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getMovingCompany = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const company = await prisma.movingCompany.findUnique({
      where: { id },
      include: {
        currentLocation: true,
        _count: {
          select: {
            services: true,
          },
        },
      },
    })

    if (!company) {
      return res.status(404).json({ error: "Moving company not found" })
    }

    // Get recent services
    const recentServices = await prisma.service.findMany({
      where: {
        movingCompanyId: id,
        serviceType: {
          category: "HOUSE_MOVING",
        },
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
        inventoryItems: true, // Assuming this is the correct field name in your schema
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    res.json({
      ...company,
      recentServices,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateMovingCompany = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateMovingCompanySchema.parse(req.body)

    // Check if company exists
    const company = await prisma.movingCompany.findUnique({
      where: { id },
    })

    if (!company) {
      return res.status(404).json({ error: "Moving company not found" })
    }

    // Check if location exists if provided
    if (data.currentLocationId) {
      const location = await prisma.location.findUnique({
        where: { id: data.currentLocationId },
      })

      if (!location) {
        return res.status(400).json({ error: "Location not found" })
      }
    }

    const updatedCompany = await prisma.movingCompany.update({
      where: { id },
      data,
      include: {
        currentLocation: true,
      },
    })

    res.json(updatedCompany)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteMovingCompany = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if company has services
    const servicesCount = await prisma.service.count({
      where: { movingCompanyId: id },
    })

    if (servicesCount > 0) {
      return res.status(400).json({
        error: "Cannot delete moving company that has services",
        servicesCount,
      })
    }

    await prisma.movingCompany.delete({
      where: { id },
    })

    res.json({ message: "Moving company deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getMovingCompanyAnalytics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { period = "month" } = req.query

    // Check if company exists
    const company = await prisma.movingCompany.findUnique({
      where: { id },
    })

    if (!company) {
      return res.status(404).json({ error: "Moving company not found" })
    }

    // Get date range based on period
    const today = new Date()
    let startDate: Date

    switch (period) {
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
        startDate = new Date(today.setMonth(today.getMonth() - 1))
    }

    // Get services
    const services = await prisma.service.findMany({
      where: {
        movingCompanyId: id,
        createdAt: {
          gte: startDate,
        },
      },
      include: {
        inventoryItems: true,
        payment: true,
        review: true,
      },
    })

    // Calculate metrics
    const totalServices = services.length
    const completedServices = services.filter((s) => s.status === "COMPLETED").length
    const cancelledServices = services.filter((s) => s.status === "CANCELLED").length
    const completionRate = totalServices > 0 ? completedServices / totalServices : 0

    const totalRevenue = services.reduce(
      (sum, service) => sum + (service.payment?.amount || service.finalPrice || service.estimatedPrice || 0),
      0,
    )

    const averageRevenue = completedServices > 0 ? totalRevenue / completedServices : 0

    // Calculate average rating
    const reviews = services.filter((s) => s.review).map((s) => s.review)
    const averageRating =
      reviews.length > 0 ? reviews.reduce((sum, review) => sum + (review?.rating || 0), 0) / reviews.length : 0

    // Get monthly service counts
    const monthlyServices = services.reduce(
      (acc, service) => {
        const month = new Date(service.createdAt).toISOString().slice(0, 7) // YYYY-MM
        if (!acc[month]) {
          acc[month] = {
            month,
            count: 0,
            revenue: 0,
          }
        }
        acc[month].count += 1
        acc[month].revenue += service.payment?.amount || service.finalPrice || service.estimatedPrice || 0
        return acc
      },
      {} as Record<string, { month: string; count: number; revenue: number }>,
    )

    const monthlyServicesArray = Object.values(monthlyServices).sort((a, b) => a.month.localeCompare(b.month))

    res.json({
      company: {
        id: company.id,
        name: company.name,
        pricePerHour: company.pricePerHour,
      },
      metrics: {
        totalServices,
        completedServices,
        cancelledServices,
        completionRate,
        totalRevenue,
        averageRevenue,
        averageRating,
      },
      monthlyServices: monthlyServicesArray,
      period,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
