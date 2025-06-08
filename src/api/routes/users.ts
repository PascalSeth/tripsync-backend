import { Router } from "express"
import {
  getUsers,
  getUser,
  updateUserStatus,
  updateUserVerification,
  getUserAnalytics,
} from "../controllers/userController"
import { authMiddleware, superAdminOnly } from "../middlewares/authMiddleware"

const router = Router()

// Admin User Routes - all require authentication and admin privileges
router.get("/", authMiddleware, superAdminOnly, getUsers)
router.get("/:id", authMiddleware, superAdminOnly, getUser)
router.put("/:id/status", authMiddleware, superAdminOnly, updateUserStatus)
router.put("/:id/verification", authMiddleware, superAdminOnly, updateUserVerification)
router.get("/:id/analytics", authMiddleware, superAdminOnly, getUserAnalytics)

export default router
