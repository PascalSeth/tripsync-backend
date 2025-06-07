// Session Routes - New file
import { Router } from "express"
import {
  getUserSessions,
  revokeSession,
  revokeAllOtherSessions,
  cleanExpiredSessions,
} from "../controllers/sessionController"
import { authMiddleware, superAdminOnly } from "../middlewares/authMiddleware"

const router = Router()

// Get user sessions
router.get("/", authMiddleware, getUserSessions)

// Revoke specific session
router.delete("/:sessionId", authMiddleware, revokeSession)

// Revoke all other sessions
router.delete("/", authMiddleware, revokeAllOtherSessions)

// Clean expired sessions (admin only)
router.post("/clean", authMiddleware, superAdminOnly, cleanExpiredSessions)

export default router
