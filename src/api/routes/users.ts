//users.ts
import { Router } from "express"
import {
  getUsers,
  getUser,
  updateUserStatus,
  updateUserVerification,
  getUserAnalytics,
} from "../controllers/userController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Admin User Routes
router.get("/admin/users", requireAuth(), getUsers)
router.get("/admin/users/:id", requireAuth(), getUser)
router.put("/admin/users/:id/status", requireAuth(), updateUserStatus)
router.put("/admin/users/:id/verification", requireAuth(), updateUserVerification)
router.get("/admin/users/:id/analytics", requireAuth(), getUserAnalytics)

export default router
