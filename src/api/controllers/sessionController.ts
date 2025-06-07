// Session Controller - New file for session management
import { prisma } from "../../config/prisma"
import type { Request, Response } from "express"
import type { AuthRequest } from "../middlewares/authMiddleware"

// Get user sessions
export const getUserSessions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId

    const sessions = await prisma.userSession.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: "desc" },
    })

    res.json(sessions)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Revoke session
export const revokeSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId
    const { sessionId } = req.params

    await prisma.userSession.updateMany({
      where: {
        id: sessionId,
        userId,
      },
      data: { isActive: false },
    })

    res.json({ message: "Session revoked successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Revoke all sessions except current
export const revokeAllOtherSessions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId
    const currentToken = req.headers.authorization?.split(" ")[1]

    await prisma.userSession.updateMany({
      where: {
        userId,
        token: { not: currentToken },
        isActive: true,
      },
      data: { isActive: false },
    })

    res.json({ message: "All other sessions revoked successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Clean expired sessions
export const cleanExpiredSessions = async (req: Request, res: Response) => {
  try {
    const result = await prisma.userSession.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { isActive: false }],
      },
    })

    res.json({
      message: "Expired sessions cleaned",
      deletedCount: result.count,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
