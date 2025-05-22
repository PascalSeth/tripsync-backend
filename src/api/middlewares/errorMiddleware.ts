//Errormiddleware.ts
import type { Request, Response, NextFunction } from "express"
import { z } from "zod"

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack)
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.errors })
  }
  res.status(err.status || 500).json({ error: err.message || "Internal server error" })
}
