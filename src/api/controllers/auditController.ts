// Audit Controller - New file for audit trail management
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import type { AuthRequest } from "../middlewares/authMiddleware"

// Schemas
export const auditLogSchema = z.object({
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().optional(),
  oldValues: z.string().optional(),
  newValues: z.string().optional(),
})

// Create audit log entry
export const createAuditLog = async (
  userId: string | undefined,
  action: string,
  resource: string,
  resourceId?: string,
  oldValues?: any,
  newValues?: any,
  req?: Request,
) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        oldValues: oldValues ? JSON.stringify(oldValues) : null,
        newValues: newValues ? JSON.stringify(newValues) : null,
        ipAddress: req?.ip,
        userAgent: req?.get("User-Agent"),
      },
    })
  } catch (error) {
    console.error("Failed to create audit log:", error)
  }
}

// Get audit logs
export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { resource, resourceId, userId, action, startDate, endDate, page = "1", limit = "50" } = req.query

    const whereClause: any = {}

    if (resource) whereClause.resource = resource
    if (resourceId) whereClause.resourceId = resourceId
    if (userId) whereClause.userId = userId
    if (action) whereClause.action = action

    if (startDate || endDate) {
      whereClause.timestamp = {}
      if (startDate) whereClause.timestamp.gte = new Date(startDate as string)
      if (endDate) whereClause.timestamp.lte = new Date(endDate as string)
    }

    const pageNum = Number.parseInt(page as string)
    const limitNum = Number.parseInt(limit as string)

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { timestamp: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.auditLog.count({ where: whereClause }),
    ])

    res.json({
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get audit log by ID
export const getAuditLog = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    })

    if (!log) {
      return res.status(404).json({ error: "Audit log not found" })
    }

    res.json(log)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get audit statistics
export const getAuditStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    const whereClause: any = {}
    if (startDate || endDate) {
      whereClause.timestamp = {}
      if (startDate) whereClause.timestamp.gte = new Date(startDate as string)
      if (endDate) whereClause.timestamp.lte = new Date(endDate as string)
    }

    // Get action counts
    const actionCounts = await prisma.auditLog.groupBy({
      by: ["action"],
      where: whereClause,
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
    })

    // Get resource counts
    const resourceCounts = await prisma.auditLog.groupBy({
      by: ["resource"],
      where: whereClause,
      _count: { resource: true },
      orderBy: { _count: { resource: "desc" } },
    })

    // Get user activity
    const userActivity = await prisma.auditLog.groupBy({
      by: ["userId"],
      where: { ...whereClause, userId: { not: null } },
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: 10,
    })

    // Get users for activity
    const userIds = userActivity.map((ua) => ua.userId).filter(Boolean) as string[]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    })

    const userActivityWithNames = userActivity.map((ua) => {
      const user = users.find((u) => u.id === ua.userId)
      return {
        ...ua,
        user,
      }
    })

    // Get daily activity
    const dailyActivity = await prisma.$queryRaw`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as count
      FROM "audit_logs"
      WHERE timestamp >= ${whereClause.timestamp?.gte || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
      AND timestamp <= ${whereClause.timestamp?.lte || new Date()}
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `

    res.json({
      actionCounts,
      resourceCounts,
      userActivity: userActivityWithNames,
      dailyActivity,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Middleware to automatically log actions
export const auditMiddleware = (action: string, resource: string) => {
  return async (req: AuthRequest, res: Response, next: any) => {
    const originalSend = res.send
    const userId = req.user?.userId

    res.send = function (data) {
      // Log successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resourceId = req.params.id || req.body.id

        // Try to parse response data for new values
        let newValues
        try {
          const parsedData = JSON.parse(data)
          newValues = parsedData
        } catch {
          // If parsing fails, don't include new values
        }

        createAuditLog(userId, action, resource, resourceId, null, newValues, req)
      }

      return originalSend.call(this, data)
    }

    next()
  }
}
