import { Router } from "express"
import authRoutes from "./auth"
import rbacRoutes from "./rbac"
import sessionRoutes from "./sessions"
import auditRoutes from "./audit"
import userRoutes from "./users"
import driverRoutes from "./drivers"
import serviceRoutes from "./services"
import serviceTypeRoutes from "./service-types"
import locationRoutes from "./locations"
import vehicleRoutes from "./vehicle"
import taxiRoutes from "./taxis"
import taxiStandRoutes from "./taxi-stands"
import taxiZoneRoutes from "./taxi-zones"
import storeRoutes from "./stores"
import paymentRoutes from "./payments"
import reviewRoutes from "./reviews"
import reportRoutes from "./reports"
import notificationRoutes from "./notifications"
import regionRoutes from "./regions"
import sharedRideRoutes from "./shared-rides"
import houseMovingRoutes from "./house-moving"
import dayBookingRoutes from "./day-booking"
import deliveryRoutes from "./delivery"
import emergencyRoutes from "./emergency"
import dashboardRoutes from "./dashboard"
import recommendationRoutes from "./recommendations"
import anonymousRoutes from "./anonymous"

const router = Router()

// Health check
router.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() })
})

// Authentication & Authorization
router.use("/auth", authRoutes)
router.use("/rbac", rbacRoutes)
router.use("/sessions", sessionRoutes)
router.use("/audit", auditRoutes)

// Core routes
router.use("/users", userRoutes)
router.use("/drivers", driverRoutes)
router.use("/services", serviceRoutes)
router.use("/service-types", serviceTypeRoutes)
router.use("/locations", locationRoutes)
router.use("/vehicles", vehicleRoutes)

// Transportation
router.use("/taxis", taxiRoutes)
router.use("/taxi-stands", taxiStandRoutes)
router.use("/taxi-zones", taxiZoneRoutes)
router.use("/shared-rides", sharedRideRoutes)
router.use("/day-booking", dayBookingRoutes)

// Services
router.use("/delivery", deliveryRoutes)
router.use("/emergency", emergencyRoutes)
router.use("/house-moving", houseMovingRoutes)

// Commerce
router.use("/stores", storeRoutes)
router.use("/payments", paymentRoutes)

// Social
router.use("/reviews", reviewRoutes)
router.use("/reports", reportRoutes)
router.use("/notifications", notificationRoutes)

// System
router.use("/regions", regionRoutes)
router.use("/dashboard", dashboardRoutes)

// Recommendations
router.use("/recommendations", recommendationRoutes)
router.use("/anonymous", anonymousRoutes)

export default router
