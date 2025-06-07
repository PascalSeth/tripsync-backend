//userController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().optional(),
})

export const updateUserVerificationSchema = z.object({
  isVerified: z.boolean(),
})

// User Management (Admin)
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { isActive, isVerified, search } = req.query
    const page = Number.parseInt(req.query.page as string) || 1
    const limit = Number.parseInt(req.query.limit as string) || 20

    const whereClause: any = {}

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    if (isVerified !== undefined) {
      whereClause.isVerified = isVerified === "true"
    }

    if (search) {
      whereClause.OR = [
        { firstName: { contains: search as string, mode: "insensitive" } },
        { lastName: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
        { phone: { contains: search as string, mode: "insensitive" } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          profileImage: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
          driver: {
            select: {
              id: true,
              approvalStatus: true,
              currentStatus: true,
            },
          },
          _count: {
            select: {
              services: true,
              reviews: true,
              reports: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({
        where: whereClause,
      }),
    ])

    res.json({
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        profileImage: true,
        address: true,
        dateOfBirth: true,
        gender: true,
        emergencyContact: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        driver: {
          include: {
            vehicle: true,
            assignedDriverTypes: {
              include: {
                serviceType: true,
              },
            },
          },
        },
        _count: {
          select: {
            services: true,
            reviews: true,
            reports: true,
            payments: true,
            favoriteLocations: true,
            notifications: true,
          },
        },
      },
    })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Get recent services
    const recentServices = await prisma.service.findMany({
      where: { userId: id },
      include: {
        serviceType: true,
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
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    // Get recent reviews
    const recentReviews = await prisma.review.findMany({
      where: { userId: id },
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    })

    // Get report count
    const reportsAgainstCount = await prisma.report.count({
      where: {
        service: {
          userId: id,
        },
      },
    })

    res.json({
      ...user,
      recentServices,
      recentReviews,
      _count: {
        ...user._count,
        reportsAgainst: reportsAgainstCount,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { isActive, reason } = updateUserStatusSchema.parse(req.body)

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Update user status
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        isActive,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    })

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId: id,
        title: isActive ? "Account Activated" : "Account Deactivated",
        body: reason || (isActive ? "Your account has been activated." : "Your account has been deactivated."),
        type: "SYSTEM",
      },
    })

    res.json({
      message: isActive ? "User activated successfully" : "User deactivated successfully",
      user: updatedUser,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateUserVerification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { isVerified } = updateUserVerificationSchema.parse(req.body)

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Update user verification
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        isVerified,
        verificationToken: isVerified ? null : user.verificationToken,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isVerified: true,
      },
    })

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId: id,
        title: isVerified ? "Account Verified" : "Account Verification Revoked",
        body: isVerified
          ? "Your account has been verified."
          : "Your account verification has been revoked. Please contact support for more information.",
        type: "SYSTEM",
      },
    })

    res.json({
      message: isVerified ? "User verified successfully" : "User verification revoked",
      user: updatedUser,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getUserAnalytics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
      },
    })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Get service stats
    const [totalServices, completedServices, cancelledServices] = await Promise.all([
      prisma.service.count({
        where: { userId: id },
      }),
      prisma.service.count({
        where: {
          userId: id,
          status: "COMPLETED",
        },
      }),
      prisma.service.count({
        where: {
          userId: id,
          status: "CANCELLED",
        },
      }),
    ])

    // Get service type breakdown
    const serviceTypeBreakdown = await prisma.service.groupBy({
      by: ["serviceTypeId"],
      where: { userId: id },
      _count: true,
    })

    // Get service types
    const serviceTypes = await prisma.serviceType.findMany({
      where: {
        id: {
          in: serviceTypeBreakdown.map((s) => s.serviceTypeId),
        },
      },
    })

    // Map service types to counts
    const serviceTypeStats = serviceTypeBreakdown.map((stat) => {
      const serviceType = serviceTypes.find((t) => t.id === stat.serviceTypeId)
      return {
        serviceType: serviceType?.name || "Unknown",
        category: serviceType?.category || "UNKNOWN",
        count: stat._count,
      }
    })

    // Get payment stats
    const payments = await prisma.payment.findMany({
      where: { userId: id },
      select: {
        amount: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
      },
    })

    const totalSpent = payments.filter((p) => p.status === "PAID").reduce((sum, payment) => sum + payment.amount, 0)

    // Get payment method breakdown
    const paymentMethodBreakdown = payments.reduce(
      (acc, payment) => {
        if (!acc[payment.paymentMethod]) {
          acc[payment.paymentMethod] = {
            count: 0,
            amount: 0,
          }
        }
        acc[payment.paymentMethod].count += 1
        if (payment.status === "PAID") {
          acc[payment.paymentMethod].amount += payment.amount
        }
        return acc
      },
      {} as Record<string, { count: number; amount: number }>,
    )

    // Get monthly service usage
    const monthlyUsage = payments.reduce(
      (acc, payment) => {
        const month = new Date(payment.createdAt).toISOString().slice(0, 7) // YYYY-MM
        if (!acc[month]) {
          acc[month] = {
            month,
            count: 0,
            amount: 0,
          }
        }
        acc[month].count += 1
        if (payment.status === "PAID") {
          acc[month].amount += payment.amount
        }
        return acc
      },
      {} as Record<string, { month: string; count: number; amount: number }>,
    )

    const monthlyUsageArray = Object.values(monthlyUsage).sort((a, b) => a.month.localeCompare(b.month))

    // Get review stats
    const userReviews = await prisma.review.findMany({
      where: { userId: id },
      select: {
        rating: true,
        driverRating: true,
        vehicleRating: true,
        serviceRating: true,
      },
    })

    const avgRating =
      userReviews.length > 0
        ? {
            overall: userReviews.reduce((sum, review) => sum + review.rating, 0) / userReviews.length,
            driver:
              userReviews.filter((r) => r.driverRating).reduce((sum, review) => sum + (review.driverRating || 0), 0) /
                userReviews.filter((r) => r.driverRating).length || 0,
            vehicle:
              userReviews.filter((r) => r.vehicleRating).reduce((sum, review) => sum + (review.vehicleRating || 0), 0) /
                userReviews.filter((r) => r.vehicleRating).length || 0,
            service:
              userReviews.filter((r) => r.serviceRating).reduce((sum, review) => sum + (review.serviceRating || 0), 0) /
                userReviews.filter((r) => r.serviceRating).length || 0,
          }
        : { overall: 0, driver: 0, vehicle: 0, service: 0 }

    // Get reviews received (if user is also a driver)
    let receivedReviews = null
    let avgReceivedRating = null

    // First check if user has a driver profile
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: user.id },
    })

    if (driverProfile) {
      const driverReviews = await prisma.driverToUserReview.findMany({
        where: { driverId: driverProfile.id },
        select: {
          rating: true,
        },
      })

      avgReceivedRating =
        driverReviews.length > 0
          ? driverReviews.reduce((sum, review) => sum + review.rating, 0) / driverReviews.length
          : 0

      receivedReviews = {
        count: driverReviews.length,
        averageRating: avgReceivedRating,
      }
    }

    res.json({
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        createdAt: user.createdAt,
      },
      serviceStats: {
        total: totalServices,
        completed: completedServices,
        cancelled: cancelledServices,
        completionRate: totalServices > 0 ? completedServices / totalServices : 0,
      },
      serviceTypeStats,
      paymentStats: {
        totalSpent,
        paymentMethodBreakdown,
      },
      monthlyUsage: monthlyUsageArray,
      reviewStats: {
        given: {
          count: userReviews.length,
          averageRating: avgRating,
        },
        received: receivedReviews,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
