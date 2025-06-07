//notificationController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  type: z.enum([
    "SERVICE_UPDATE",
    "PAYMENT",
    "PROMOTION",
    "SYSTEM",
    "EMERGENCY",
    "DRIVER_ASSIGNED",
    "DELIVERY_UPDATE",
    "PLACE_RECOMMENDATION",
  ]),
  data: z.string().optional(), // JSON string
})

export const createBroadcastSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  type: z.enum([
    "SERVICE_UPDATE",
    "PAYMENT",
    "PROMOTION",
    "SYSTEM",
    "EMERGENCY",
    "DRIVER_ASSIGNED",
    "DELIVERY_UPDATE",
    "PLACE_RECOMMENDATION",
  ]),
  data: z.string().optional(), // JSON string
  userFilter: z
    .object({
      isDriver: z.boolean().optional(),
      isActive: z.boolean().optional(),
      isVerified: z.boolean().optional(),
    })
    .optional(),
})

// Notification Management
export const createNotification = async (req: Request, res: Response) => {
  try {
    const data = createNotificationSchema.parse(req.body)

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
    })

    if (!user) {
      return res.status(400).json({ error: "User not found" })
    }

    const notification = await prisma.notification.create({
      data,
    })

    // In a real implementation, we would emit a socket event or push notification here
    ;(req as any).io?.to(`user:${data.userId}`).emit("notification", notification)

    res.status(201).json(notification)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const { userId, type, isRead } = req.query
    const page = Number.parseInt(req.query.page as string) || 1
    const limit = Number.parseInt(req.query.limit as string) || 20

    const whereClause: any = {}

    if (userId) {
      whereClause.userId = userId
    }

    if (type) {
      whereClause.type = type
    }

    if (isRead !== undefined) {
      whereClause.isRead = isRead === "true"
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({
        where: whereClause,
      }),
    ])

    res.json({
      notifications,
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

export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if notification exists
    const notification = await prisma.notification.findUnique({
      where: { id },
    })

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" })
    }

    const updatedNotification = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    })

    res.json(updatedNotification)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const markAllNotificationsAsRead = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" })
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return res.status(400).json({ error: "User not found" })
    }

    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: { isRead: true },
    })

    res.json({ message: "All notifications marked as read" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if notification exists
    const notification = await prisma.notification.findUnique({
      where: { id },
    })

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" })
    }

    await prisma.notification.delete({
      where: { id },
    })

    res.json({ message: "Notification deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const createBroadcastNotification = async (req: Request, res: Response) => {
  try {
    const { title, body, type, data, userFilter } = createBroadcastSchema.parse(req.body)

    // Build user filter
    const whereClause: any = {}

    if (userFilter) {
      if (userFilter.isDriver !== undefined) {
        if (userFilter.isDriver) {
          whereClause.driver = { isNot: null }
        } else {
          whereClause.driver = null
        }
      }

      if (userFilter.isActive !== undefined) {
        whereClause.isActive = userFilter.isActive
      }

      if (userFilter.isVerified !== undefined) {
        whereClause.isVerified = userFilter.isVerified
      }
    }

    // Get users
    const users = await prisma.user.findMany({
      where: whereClause,
      select: { id: true },
    })

    if (users.length === 0) {
      return res.status(400).json({ error: "No users match the filter criteria" })
    }

    // Create notifications
    const notifications = await prisma.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        title,
        body,
        type,
        data,
      })),
    })

    // In a real implementation, we would emit socket events or push notifications here
    if ((req as any).io) {
      users.forEach((user) => {
        ;(req as any).io.to(`user:${user.id}`).emit("notification", {
          userId: user.id,
          title,
          body,
          type,
          data,
          createdAt: new Date(),
        })
      })
    }

    res.status(201).json({
      message: "Broadcast notification sent successfully",
      count: notifications.count,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getNotificationStats = async (req: Request, res: Response) => {
  try {
    // Get total counts
    const [totalNotifications, unreadNotifications] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.count({
        where: { isRead: false },
      }),
    ])

    // Get notification counts by type
    const notificationsByType = await prisma.notification.groupBy({
      by: ["type"],
      _count: true,
    })

    // Get daily notification counts for the past 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const dailyNotifications = await prisma.$queryRaw`
      SELECT 
        DATE(n."createdAt") as date,
        COUNT(*) as count
      FROM "notifications" n
      WHERE n."createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE(n."createdAt")
      ORDER BY date ASC
    `

    res.json({
      totalNotifications,
      unreadNotifications,
      readRate: totalNotifications > 0 ? 1 - unreadNotifications / totalNotifications : 0,
      notificationsByType,
      dailyNotifications,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
