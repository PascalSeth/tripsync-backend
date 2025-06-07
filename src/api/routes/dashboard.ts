//dashboard.ts
import { Router } from "express"
import {
  getDriverAnalytics,
  getAdminDashboardOverview,
  getPendingDrivers,
  approveDriver,
  getDriverPerformance,
  getActiveServices,
  getServiceAnalytics,
  assignDriverToService,
  getStoreAnalytics,
  getPaymentAnalytics,
  getRecommendationAnalytics,
  getEmergencyAnalytics,
  getReportAnalytics,
  getSystemConfig,
  updateSystemConfig,
} from "../controllers/dashBoardController"
import { requireAuth } from "@clerk/express"
import { driverOnly } from "../controllers/serviceController"

const router = Router()

// Admin Dashboard Overview
router.get("/admin/overview", requireAuth(), getAdminDashboardOverview)

// Driver Management
router.get("/admin/drivers/pending", requireAuth(), getPendingDrivers)
router.put("/admin/drivers/:id/approve", requireAuth(), approveDriver)
router.get("/admin/drivers/:id/performance", requireAuth(), getDriverPerformance)

// Driver Dashboard
router.get("/driver/analytics", requireAuth(), driverOnly, getDriverAnalytics)

// Service Management
router.get("/admin/services/active", requireAuth(), getActiveServices)
router.get("/admin/services/analytics", requireAuth(), getServiceAnalytics)
router.post("/admin/services/assign-driver", requireAuth(), assignDriverToService)

// Store Analytics
router.get("/admin/stores/:storeId/analytics", requireAuth(), getStoreAnalytics)

// Payment Analytics
router.get("/admin/payments/analytics", requireAuth(), getPaymentAnalytics)

// Place Recommendation Analytics
router.get("/admin/recommendations/analytics", requireAuth(), getRecommendationAnalytics)

// Emergency Services Analytics
router.get("/admin/emergency/analytics", requireAuth(), getEmergencyAnalytics)

// Report Analytics
router.get("/admin/reports/analytics", requireAuth(), getReportAnalytics)

// System Configuration
router.get("/admin/config", requireAuth(), getSystemConfig)
router.put("/admin/config/:key", requireAuth(), updateSystemConfig)

export default router
