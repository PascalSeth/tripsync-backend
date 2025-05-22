import { Router } from "express"
import authRoutes from "./auth"
import userRoutes from "./users"
import driverRoutes from "./drivers"
import locationRoutes from "./locations"
import serviceRoutes from "./services"
import taxiRoutes from "./taxis"
import paymentRoutes from "./payments"
import taxiZoneRoutes from "./taxi-zones"
import taxiStandRoutes from "./taxi-stands"
import reviewRoutes from "./reviews"
import sharedRideRoutes from "./shared-rides"
import dayBookingRoutes from "./day-booking"
import storeRoutes from "./stores"
import deliveryRoutes from "./delivery"
import regionRoutes from "./regions"
import emergencyRoutes from "./emergency"
import houseMovingRoutes from "./house-moving"
import anonymousRoutes from "./anonymous"
import recommendationRoutes from "./recommendations"

const router = Router()

// Phase 1 & 2 Routes
router.use("/auth", authRoutes)
router.use("/users", userRoutes)
router.use("/drivers", driverRoutes)
router.use("/locations", locationRoutes)
router.use("/services", serviceRoutes)
router.use("/taxis", taxiRoutes)
router.use("/payments", paymentRoutes)
router.use("/taxi-zones", taxiZoneRoutes)
router.use("/taxi-stands", taxiStandRoutes)
router.use("/reviews", reviewRoutes)

// Phase 3 Routes
router.use("/shared-rides", sharedRideRoutes)
router.use("/day-booking", dayBookingRoutes)
router.use("/stores", storeRoutes)
router.use("/delivery", deliveryRoutes)
router.use("/regions", regionRoutes)

// Phase 4 Routes
router.use("/emergency", emergencyRoutes)
router.use("/house-moving", houseMovingRoutes)
router.use("/anonymous", anonymousRoutes)
router.use("/recommendations", recommendationRoutes)

export default router
