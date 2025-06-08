//notifications.ts
import { Router } from "express"
import {
  createNotification,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  createBroadcastNotification,
  getNotificationStats,
} from "../controllers/notificationController"
import { authMiddleware, superAdminOnly } from "../middlewares/authMiddleware"

const router = Router()

// Admin Notification Routes
router.post("/admin/notifications", superAdminOnly,authMiddleware, createNotification)
router.get("/admin/notifications", superAdminOnly,authMiddleware, getNotifications)
router.put("/admin/notifications/:id/read", superAdminOnly,authMiddleware, markNotificationAsRead)
router.post("/admin/notifications/mark-all-read", superAdminOnly,authMiddleware, markAllNotificationsAsRead)
router.delete("/admin/notifications/:id", superAdminOnly,authMiddleware, deleteNotification)
router.post("/admin/notifications/broadcast", superAdminOnly,authMiddleware, createBroadcastNotification)
router.get("/admin/notifications/stats", superAdminOnly,authMiddleware, getNotificationStats)

export default router
