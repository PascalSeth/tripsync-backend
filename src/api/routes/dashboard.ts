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
import { authMiddleware, superAdminOnly } from "../middlewares/authMiddleware"

const router = Router()

// Admin Dashboard Overview
router.get("/admin/overview", superAdminOnly,authMiddleware, getAdminDashboardOverview)

// Driver Management
router.get("/admin/drivers/pending", superAdminOnly,authMiddleware, getPendingDrivers)
router.put("/admin/drivers/:id/approve", superAdminOnly,authMiddleware, approveDriver)
router.get("/admin/drivers/:id/performance", superAdminOnly,authMiddleware, getDriverPerformance)

// Driver Dashboard
router.get("/driver/analytics", superAdminOnly,authMiddleware, driverOnly, getDriverAnalytics)

// Service Management
router.get("/admin/services/active", superAdminOnly,authMiddleware, getActiveServices)
router.get("/admin/services/analytics", superAdminOnly,authMiddleware, getServiceAnalytics)
router.post("/admin/services/assign-driver", superAdminOnly,authMiddleware, assignDriverToService)

// Store Analytics
router.get("/admin/stores/:storeId/analytics", superAdminOnly,authMiddleware, getStoreAnalytics)

// Payment Analytics
router.get("/admin/payments/analytics", superAdminOnly,authMiddleware, getPaymentAnalytics)

// Place Recommendation Analytics
router.get("/admin/recommendations/analytics", superAdminOnly,authMiddleware, getRecommendationAnalytics)

// Emergency Services Analytics
router.get("/admin/emergency/analytics", superAdminOnly,authMiddleware, getEmergencyAnalytics)

// Report Analytics
router.get("/admin/reports/analytics", superAdminOnly,authMiddleware, getReportAnalytics)

// System Configuration
router.get("/admin/config", superAdminOnly,authMiddleware, getSystemConfig)
router.put("/admin/config/:key", superAdminOnly,authMiddleware, updateSystemConfig)

export default router
