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
import { requireAuth } from "@clerk/express"

const router = Router()

// Admin Notification Routes
router.post("/admin/notifications", requireAuth(), createNotification)
router.get("/admin/notifications", requireAuth(), getNotifications)
router.put("/admin/notifications/:id/read", requireAuth(), markNotificationAsRead)
router.post("/admin/notifications/mark-all-read", requireAuth(), markAllNotificationsAsRead)
router.delete("/admin/notifications/:id", requireAuth(), deleteNotification)
router.post("/admin/notifications/broadcast", requireAuth(), createBroadcastNotification)
router.get("/admin/notifications/stats", requireAuth(), getNotificationStats)

export default router
