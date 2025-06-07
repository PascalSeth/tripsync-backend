//dashBoardController.ts
import { prisma } from "../../config/prisma"
import type { Request, Response } from "express"

// ===== DRIVER DASHBOARD ANALYTICS =====

export const getDriverAnalytics = async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver.id
    const { period = "week" } = req.query

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

    // Get completed services
    const completedServices = await prisma.service.findMany({
      where: {
        driverId,
        status: "COMPLETED",
        completedTime: {
          gte: startDate,
        },
      },
      include: {
        payment: true,
        serviceType: true,
        review: true,
      },
    })

    // Calculate metrics
    const totalTrips = completedServices.length
    const totalEarnings = completedServices.reduce(
      (sum, service) => sum + (service.finalPrice || service.estimatedPrice || 0),
      0,
    )

    const averageRating =
      completedServices.reduce((sum, service) => sum + (service.review?.rating || 0), 0) /
      (completedServices.filter((s) => s.review).length || 1)

    // Calculate total distance
    const totalDistance = completedServices.reduce(
      (sum, service) => sum + (service.actualDistance || service.estimatedDistance || 0),
      0,
    )

    // Group by service type
    const serviceTypeBreakdown = completedServices.reduce(
      (acc, service) => {
        const category = service.serviceType.category
        if (!acc[category]) {
          acc[category] = {
            count: 0,
            earnings: 0,
          }
        }
        acc[category].count += 1
        acc[category].earnings += service.finalPrice || service.estimatedPrice || 0
        return acc
      },
      {} as Record<string, { count: number; earnings: number }>,
    )

    // Get daily earnings for chart
    const dailyEarnings = await prisma.$queryRaw`
      SELECT 
        DATE(s."completedTime") as date,
        SUM(s."finalPrice") as earnings
      FROM "services" s
      WHERE s."driverId" = ${driverId}
      AND s.status = 'COMPLETED'
      AND s."completedTime" >= ${startDate}
      GROUP BY DATE(s."completedTime")
      ORDER BY date ASC
    `

    res.json({
      totalTrips,
      totalEarnings,
      averageRating,
      totalDistance,
      serviceTypeBreakdown,
      dailyEarnings,
      period,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// ===== ADMIN DASHBOARD ANALYTICS =====

export const getAdminDashboardOverview = async (req: Request, res: Response) => {
  try {
    // Get counts
    const [totalUsers, totalDrivers, pendingDrivers, totalServices, activeServices, totalStores, totalPayments] =
      await Promise.all([
        prisma.user.count({ where: { isActive: true } }),
        prisma.driverProfile.count({ where: { approvalStatus: "APPROVED" } }),
        prisma.driverProfile.count({ where: { approvalStatus: "PENDING" } }),
        prisma.service.count(),
        prisma.service.count({
          where: {
            status: {
              in: ["REQUESTED", "SCHEDULED", "DRIVER_ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"],
            },
          },
        }),
        prisma.store.count({ where: { isActive: true } }),
        prisma.payment.count({ where: { status: "PAID" } }),
      ])

    // Get revenue
    const totalRevenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: "PAID" },
    })

    // Get recent services
    const recentServices = await prisma.service.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
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
        payment: true,
      },
    })

    // Get service stats by type
    const servicesByType = await prisma.service.groupBy({
      by: ["serviceTypeId"],
      _count: true,
      orderBy: {
        _count: {
          serviceTypeId: "desc",
        },
      },
    })

    // Get service types
    const serviceTypes = await prisma.serviceType.findMany({
      where: {
        id: {
          in: servicesByType.map((s) => s.serviceTypeId),
        },
      },
    })

    // Map service types to counts
    const serviceTypeStats = servicesByType.map((stat) => {
      const serviceType = serviceTypes.find((t) => t.id === stat.serviceTypeId)
      return {
        serviceType: serviceType?.name || "Unknown",
        category: serviceType?.category || "UNKNOWN",
        count: stat._count,
      }
    })

    res.json({
      counts: {
        users: totalUsers,
        drivers: totalDrivers,
        pendingDrivers,
        services: totalServices,
        activeServices,
        stores: totalStores,
        payments: totalPayments,
      },
      revenue: totalRevenue._sum.amount || 0,
      recentServices,
      serviceTypeStats,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// ===== DRIVER MANAGEMENT =====

export const getPendingDrivers = async (req: Request, res: Response) => {
  try {
    const pendingDrivers = await prisma.driverProfile.findMany({
      where: { approvalStatus: "PENDING" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            profileImage: true,
            createdAt: true,
          },
        },
        vehicle: true,
      },
      orderBy: { user: { createdAt: "desc" } },
    })

    res.json(pendingDrivers)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const approveDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { approve, reason } = req.body

    if (approve) {
      const driver = await prisma.driverProfile.update({
        where: { id },
        data: {
          approvalStatus: "APPROVED",
          backgroundCheckDate: new Date(),
        },
        include: {
          user: true,
        },
      })

      // Create notification for driver
      await prisma.notification.create({
        data: {
          userId: driver.userId,
          title: "Driver Application Approved",
          body: "Your driver application has been approved. You can now start accepting rides.",
          type: "SYSTEM",
        },
      })

      res.json({ message: "Driver approved successfully", driver })
    } else {
      const driver = await prisma.driverProfile.update({
        where: { id },
        data: { approvalStatus: "REJECTED" },
        include: {
          user: true,
        },
      })

      // Create notification for driver
      await prisma.notification.create({
        data: {
          userId: driver.userId,
          title: "Driver Application Rejected",
          body: reason || "Your driver application has been rejected. Please contact support for more information.",
          type: "SYSTEM",
        },
      })

      res.json({ message: "Driver rejected", driver })
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getDriverPerformance = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const driver = await prisma.driverProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            profileImage: true,
          },
        },
        vehicle: true,
      },
    })

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" })
    }

    // Get completed services
    const completedServices = await prisma.service.findMany({
      where: {
        driverId: id,
        status: "COMPLETED",
      },
      include: {
        review: true,
        serviceType: true,
        payment: true,
      },
    })

    // Calculate metrics
    const totalTrips = completedServices.length
    const totalEarnings = completedServices.reduce(
      (sum, service) => sum + (service.finalPrice || service.estimatedPrice || 0),
      0,
    )

    const reviews = completedServices.filter((s) => s.review).map((s) => s.review)
    const averageRating =
      reviews.length > 0 ? reviews.reduce((sum, review) => sum + (review?.rating || 0), 0) / reviews.length : 0

    // Get service type breakdown
    const serviceTypeBreakdown = completedServices.reduce(
      (acc, service) => {
        const category = service.serviceType.category
        if (!acc[category]) {
          acc[category] = {
            count: 0,
            earnings: 0,
          }
        }
        acc[category].count += 1
        acc[category].earnings += service.finalPrice || service.estimatedPrice || 0
        return acc
      },
      {} as Record<string, { count: number; earnings: number }>,
    )

    // Get monthly earnings
    const monthlyEarnings = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', s."completedTime") as month,
        SUM(s."finalPrice") as earnings
      FROM "services" s
      WHERE s."driverId" = ${id}
      AND s.status = 'COMPLETED'
      GROUP BY DATE_TRUNC('month', s."completedTime")
      ORDER BY month ASC
      LIMIT 12
    `

    // Get reports against driver
    const reports = await prisma.report.count({
      where: {
        reportedDriverId: id,
      },
    })

    res.json({
      driver,
      performance: {
        totalTrips,
        totalEarnings,
        averageRating,
        serviceTypeBreakdown,
        monthlyEarnings,
        reports,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// ===== SERVICE MANAGEMENT =====

export const getActiveServices = async (req: Request, res: Response) => {
  try {
    const activeServices = await prisma.service.findMany({
      where: {
        status: {
          in: ["REQUESTED", "SCHEDULED", "DRIVER_ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"],
        },
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
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
        pickupLocation: true,
        dropoffLocation: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    res.json(activeServices)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getServiceAnalytics = async (req: Request, res: Response) => {
  try {
    const { period = "week" } = req.query

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

    // Get service counts by status
    const servicesByStatus = await prisma.service.groupBy({
      by: ["status"],
      _count: true,
      where: {
        createdAt: {
          gte: startDate,
        },
      },
    })

    // Get service counts by type
    const servicesByType = await prisma.service.groupBy({
      by: ["serviceTypeId"],
      _count: true,
      where: {
        createdAt: {
          gte: startDate,
        },
      },
    })

    // Get service types
    const serviceTypes = await prisma.serviceType.findMany({
      where: {
        id: {
          in: servicesByType.map((s) => s.serviceTypeId),
        },
      },
    })

    // Map service types to counts
    const serviceTypeStats = servicesByType.map((stat) => {
      const serviceType = serviceTypes.find((t) => t.id === stat.serviceTypeId)
      return {
        serviceType: serviceType?.name || "Unknown",
        category: serviceType?.category || "UNKNOWN",
        count: stat._count,
      }
    })

    // Get daily service counts
    const dailyServiceCounts = await prisma.$queryRaw`
      SELECT 
        DATE(s."createdAt") as date,
        COUNT(*) as count
      FROM "services" s
      WHERE s."createdAt" >= ${startDate}
      GROUP BY DATE(s."createdAt")
      ORDER BY date ASC
    `

    // Fix for avgCompletionTime being of type 'unknown'
    // Line 548
    const avgCompletionTime = await prisma.$queryRaw`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (s."completedTime" - s."createdAt"))) as avg_seconds
      FROM "services" s
      WHERE s.status = 'COMPLETED'
      AND s."createdAt" >= ${startDate}
      AND s."completedTime" IS NOT NULL
    `

    const avgRatings = await prisma.review.aggregate({
      _avg: {
        rating: true,
      },
      where: {
        createdAt: {
          gte: startDate,
        },
      },
    })

    res.json({
      servicesByStatus,
      serviceTypeStats,
      dailyServiceCounts,
      avgCompletionTime: Number((avgCompletionTime as any)[0]?.avg_seconds || 0),
      avgRatings: avgRatings._avg,
      period,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const assignDriverToService = async (req: Request, res: Response) => {
  try {
    const { serviceId, driverId } = req.body

    // Check if service exists and is in a valid state
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { serviceType: true },
    })

    if (!service) {
      return res.status(404).json({ error: "Service not found" })
    }

    if (service.status !== "REQUESTED" && service.status !== "SCHEDULED") {
      return res.status(400).json({ error: "Service is not in a valid state for driver assignment" })
    }

    // Check if driver exists and is available
    const driver = await prisma.driverProfile.findUnique({
      where: {
        id: driverId,
        approvalStatus: "APPROVED",
        currentStatus: "ONLINE",
      },
    })

    if (!driver) {
      return res.status(404).json({ error: "Driver not found or not available" })
    }

    // Check if driver is assigned to this service type
    const assignedType = await prisma.assignedDriverType.findFirst({
      where: {
        driverProfileId: driverId,
        serviceTypeId: service.serviceTypeId,
        isActive: true,
      },
    })

    if (!assignedType) {
      return res.status(400).json({ error: "Driver is not assigned to this service type" })
    }

    // Update service with driver
    const updatedService = await prisma.service.update({
      where: { id: serviceId },
      data: {
        driverId,
        status: "DRIVER_ACCEPTED",
      },
      include: {
        pickupLocation: true,
        dropoffLocation: true,
        serviceType: true,
      },
    })

    // Update driver status
    await prisma.driverProfile.update({
      where: { id: driverId },
      data: { currentStatus: "ON_TRIP" },
    })

    // Create notification for driver
    await prisma.notification.create({
      data: {
        userId: driver.userId,
        title: "New Service Assigned",
        body: `You have been assigned a new ${service.serviceType.name} service.`,
        type: "SERVICE_UPDATE",
        data: JSON.stringify({ serviceId }),
      },
    })

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId: service.userId,
        title: "Driver Assigned",
        body: "A driver has been assigned to your service.",
        type: "SERVICE_UPDATE",
        data: JSON.stringify({ serviceId }),
      },
    })

    // Emit socket event
    ;(req as any).io.to(`service:${serviceId}`).emit("service:driver_assigned", { serviceId, driverId })

    res.json(updatedService)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// ===== STORE MANAGEMENT =====

export const getStoreAnalytics = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params
    const { period = "month" } = req.query

    // Check if store exists
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
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

    // Get orders for this store
    const orders = await prisma.service.findMany({
      where: {
        storeId,
        createdAt: {
          gte: startDate,
        },
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        payment: true,
      },
    })

    // Calculate metrics
    const totalOrders = orders.length
    const totalRevenue = orders.reduce(
      (sum, order) => sum + (order.payment?.amount || order.finalPrice || order.estimatedPrice || 0),
      0,
    )

    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Get product sales
    const productSales: Record<
      string,
      {
        productId: string
        name: string
        quantity: number
        revenue: number
      }
    > = {}

    orders.forEach((order) => {
      order.orderItems.forEach((item) => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            productId: item.productId,
            name: item.product.name,
            quantity: 0,
            revenue: 0,
          }
        }
        productSales[item.productId].quantity += item.quantity
        productSales[item.productId].revenue += item.quantity * item.unitPrice
      })
    })

    // Get top products
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    // Get daily order counts and revenue
    const dailyStats = orders.reduce(
      (acc, order) => {
        const date = new Date(order.createdAt).toISOString().split("T")[0]
        if (!acc[date]) {
          acc[date] = {
            date,
            orders: 0,
            revenue: 0,
          }
        }
        acc[date].orders += 1
        acc[date].revenue += order.payment?.amount || order.finalPrice || order.estimatedPrice || 0
        return acc
      },
      {} as Record<string, { date: string; orders: number; revenue: number }>,
    )

    const dailyStatsArray = Object.values(dailyStats).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )

    res.json({
      store: {
        id: store.id,
        name: store.name,
        type: store.type,
      },
      metrics: {
        totalOrders,
        totalRevenue,
        averageOrderValue,
      },
      topProducts,
      dailyStats: dailyStatsArray,
      period,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// ===== PAYMENT ANALYTICS =====

export const getPaymentAnalytics = async (req: Request, res: Response) => {
  try {
    const { period = "month" } = req.query

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

    // Get payments
    const payments = await prisma.payment.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
      },
    })

    // Calculate metrics
    const totalPayments = payments.length
    const totalRevenue = payments.reduce((sum, payment) => sum + (payment.status === "PAID" ? payment.amount : 0), 0)

    const pendingAmount = payments.reduce(
      (sum, payment) => sum + (payment.status === "PENDING" ? payment.amount : 0),
      0,
    )

    // Group by payment method
    const paymentMethodBreakdown = payments.reduce(
      (acc, payment) => {
        if (!acc[payment.paymentMethod]) {
          acc[payment.paymentMethod] = {
            count: 0,
            amount: 0,
          }
        }
        acc[payment.paymentMethod].count += 1
        acc[payment.paymentMethod].amount += payment.amount
        return acc
      },
      {} as Record<string, { count: number; amount: number }>,
    )

    // Group by payment status
    const paymentStatusBreakdown = payments.reduce(
      (acc, payment) => {
        if (!acc[payment.status]) {
          acc[payment.status] = {
            count: 0,
            amount: 0,
          }
        }
        acc[payment.status].count += 1
        acc[payment.status].amount += payment.amount
        return acc
      },
      {} as Record<string, { count: number; amount: number }>,
    )

    // Group by service type
    const serviceTypeBreakdown = payments.reduce(
      (acc, payment) => {
        const category = payment.service.serviceType.category
        if (!acc[category]) {
          acc[category] = {
            count: 0,
            amount: 0,
          }
        }
        acc[category].count += 1
        acc[category].amount += payment.amount
        return acc
      },
      {} as Record<string, { count: number; amount: number }>,
    )

    // Get daily payment amounts
    const dailyPayments = payments.reduce(
      (acc, payment) => {
        const date = new Date(payment.createdAt).toISOString().split("T")[0]
        if (!acc[date]) {
          acc[date] = {
            date,
            count: 0,
            amount: 0,
          }
        }
        acc[date].count += 1
        acc[date].amount += payment.status === "PAID" ? payment.amount : 0
        return acc
      },
      {} as Record<string, { date: string; count: number; amount: number }>,
    )

    const dailyPaymentsArray = Object.values(dailyPayments).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )

    res.json({
      metrics: {
        totalPayments,
        totalRevenue,
        pendingAmount,
      },
      paymentMethodBreakdown,
      paymentStatusBreakdown,
      serviceTypeBreakdown,
      dailyPayments: dailyPaymentsArray,
      period,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// ===== PLACE RECOMMENDATION ANALYTICS =====

export const getRecommendationAnalytics = async (req: Request, res: Response) => {
  try {
    // Get place categories
    const categories = await prisma.placeCategory.findMany({
      where: { isActive: true },
    })

    // Get top places by recommendation score
    const topPlaces = await prisma.place.findMany({
      where: { isActive: true },
      orderBy: { recommendationScore: "desc" },
      take: 10,
      include: {
        category: true,
        location: true,
      },
    })

    // Get most viewed places
    const mostViewedPlaces = await prisma.place.findMany({
      where: { isActive: true },
      orderBy: { viewCount: "desc" },
      take: 10,
      include: {
        category: true,
      },
    })

    // Get survey stats
    const surveyStats = await prisma.$transaction([
      prisma.survey.count(),
      prisma.survey.count({ where: { status: "COMPLETED" } }),
      prisma.placeVote.count(),
      prisma.placeVote.count({ where: { isLiked: true } }),
    ])

    const [totalSurveys, completedSurveys, totalVotes, likedVotes] = surveyStats

    // Get votes by category
    const votesByCategory = await prisma.placeVote.groupBy({
      by: ["isLiked"],
      _count: true,
      where: {
        place: {
          category: {
            isActive: true,
          },
        },
      },
      orderBy: {
        _count: {
          isLiked: "desc",
        },
      },
    })

    // Get category stats
    const categoryStats = await Promise.all(
      categories.map(async (category) => {
        const places = await prisma.place.count({
          where: { categoryId: category.id, isActive: true },
        })

        const votes = await prisma.placeVote.count({
          where: {
            place: {
              categoryId: category.id,
            },
          },
        })

        const likedVotes = await prisma.placeVote.count({
          where: {
            isLiked: true,
            place: {
              categoryId: category.id,
            },
          },
        })

        return {
          category: category.name,
          categoryId: category.id,
          places,
          votes,
          likedVotes,
          likeRatio: votes > 0 ? likedVotes / votes : 0,
        }
      }),
    )

    res.json({
      metrics: {
        totalSurveys,
        completedSurveys,
        completionRate: totalSurveys > 0 ? completedSurveys / totalSurveys : 0,
        totalVotes,
        likedVotes,
        likeRatio: totalVotes > 0 ? likedVotes / totalVotes : 0,
      },
      topPlaces,
      mostViewedPlaces,
      categoryStats,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// ===== EMERGENCY SERVICES ANALYTICS =====

export const getEmergencyAnalytics = async (req: Request, res: Response) => {
  try {
    const { period = "month" } = req.query

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

    // Get emergency services
    const emergencyServices = await prisma.service.findMany({
      where: {
        serviceType: {
          category: "EMERGENCY",
        },
        createdAt: {
          gte: startDate,
        },
      },
      include: {
        pickupLocation: true,
        driver: true,
      },
    })

    // Calculate metrics
    const totalEmergencies = emergencyServices.length

    // Group by emergency type
    const emergencyTypeBreakdown = emergencyServices.reduce(
      (acc, service) => {
        const type = service.emergencyType || "UNKNOWN"
        if (!acc[type]) {
          acc[type] = 0
        }
        acc[type] += 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Group by status
    const statusBreakdown = emergencyServices.reduce(
      (acc, service) => {
        if (!acc[service.status]) {
          acc[service.status] = 0
        }
        acc[service.status] += 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Calculate response times
    const responseTimes = emergencyServices
      .filter((service) => service.startTime && service.createdAt)
      .map((service) => {
        const createdAt = new Date(service.createdAt)
        const startTime = new Date(service.startTime!)
        return (startTime.getTime() - createdAt.getTime()) / (1000 * 60) // in minutes
      })

    const averageResponseTime =
      responseTimes.length > 0 ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0

    // Get daily emergency counts
    const dailyEmergencies = emergencyServices.reduce(
      (acc, service) => {
        const date = new Date(service.createdAt).toISOString().split("T")[0]
        if (!acc[date]) {
          acc[date] = {
            date,
            count: 0,
          }
        }
        acc[date].count += 1
        return acc
      },
      {} as Record<string, { date: string; count: number }>,
    )

    const dailyEmergenciesArray = Object.values(dailyEmergencies).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )

    res.json({
      metrics: {
        totalEmergencies,
        averageResponseTime,
      },
      emergencyTypeBreakdown,
      statusBreakdown,
      dailyEmergencies: dailyEmergenciesArray,
      period,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// ===== REPORT MANAGEMENT =====

export const getReportAnalytics = async (req: Request, res: Response) => {
  try {
    // Get reports
    const reports = await prisma.report.findMany({
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        service: {
          include: {
            serviceType: true,
          },
        },
        reportedDriver: {
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

    // Calculate metrics
    const totalReports = reports.length
    const unresolvedReports = reports.filter(
      (report) => report.status !== "RESOLVED" && report.status !== "DISMISSED",
    ).length

    // Group by report type
    const reportTypeBreakdown = reports.reduce(
      (acc, report) => {
        if (!acc[report.reportType]) {
          acc[report.reportType] = 0
        }
        acc[report.reportType] += 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Group by status
    const statusBreakdown = reports.reduce(
      (acc, report) => {
        if (!acc[report.status]) {
          acc[report.status] = 0
        }
        acc[report.status] += 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Group by service type
    const serviceTypeBreakdown = reports.reduce(
      (acc, report) => {
        const category = report.service.serviceType.category
        if (!acc[category]) {
          acc[category] = 0
        }
        acc[category] += 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Get monthly report counts
    const monthlyReports = reports.reduce(
      (acc, report) => {
        const month = new Date(report.createdAt).toISOString().slice(0, 7) // YYYY-MM
        if (!acc[month]) {
          acc[month] = {
            month,
            count: 0,
          }
        }
        acc[month].count += 1
        return acc
      },
      {} as Record<string, { month: string; count: number }>,
    )

    const monthlyReportsArray = Object.values(monthlyReports).sort((a, b) => a.month.localeCompare(b.month))

    res.json({
      metrics: {
        totalReports,
        unresolvedReports,
        resolutionRate: totalReports > 0 ? 1 - unresolvedReports / totalReports : 0,
      },
      reportTypeBreakdown,
      statusBreakdown,
      serviceTypeBreakdown,
      monthlyReports: monthlyReportsArray,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// ===== SYSTEM CONFIGURATION =====

export const getSystemConfig = async (req: Request, res: Response) => {
  try {
    const configs = await prisma.systemConfig.findMany()

    // Group configs by key prefix
    const groupedConfigs = configs.reduce(
      (acc, config) => {
        const [group, ...rest] = config.key.split(".")
        if (!acc[group]) {
          acc[group] = {}
        }

        const key = rest.join(".")
        acc[group][key] = config.value

        return acc
      },
      {} as Record<string, Record<string, string>>,
    )

    res.json(groupedConfigs)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateSystemConfig = async (req: Request, res: Response) => {
  try {
    const { key } = req.params
    const { value, description } = req.body

    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: {
        value,
        description: description || undefined,
      },
      create: {
        key,
        value,
        description,
      },
    })

    res.json(config)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
