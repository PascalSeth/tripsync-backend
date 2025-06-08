//users.ts
import { Router } from "express"
import {
  getUsers,
  getUser,
  updateUserStatus,
  updateUserVerification,
  getUserAnalytics,
} from "../controllers/userController"
import { superAdminOnly } from "../middlewares/authMiddleware"

const router = Router()

// Admin User Routes
router.get("/admin/users",   superAdminOnly, getUsers)
router.get("/admin/users/:id", superAdminOnly, getUser)
router.put("/admin/users/:id/status", superAdminOnly, updateUserStatus)
router.put("/admin/users/:id/verification", superAdminOnly, updateUserVerification)
router.get("/admin/users/:id/analytics", superAdminOnly, getUserAnalytics)

export default router
