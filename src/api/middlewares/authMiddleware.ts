//AuthMiddleware.ts
import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { env } from "../../config/env"

export interface AuthRequest extends Request {
  user?: { userId: string }
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const token = authHeader.split(" ")[1]
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string }
    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ error: "Invalid token" })
  }
}
