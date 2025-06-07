//index.ts
import { Router } from "express"
import dashboardRoutes from "./dashboard"
import vehicleRoutes from "./vehicle"
import serviceTypeRoutes from "./service-types"
import reportRoutes from "./reports"
import regionRoutes from "./regions"
import taxiZoneRoutes from "./taxi-zones"
import taxiStandRoutes from "./taxi-stands"
import recommendationRoutes from "./recommendations"
import storeRoutes from "./stores"
import houseMovingRoutes from "./house-moving"
import userRoutes from "./users"
import notificationRoutes from "./notifications"
import locationRoutes from "./locations"
import anonymousRoutes from "./anonymous"
import authRoute from "./auth"
const router = Router()
router.use("/auth",authRoute)
router.use("/dashboard", dashboardRoutes)
router.use("/vehicles", vehicleRoutes)
router.use("/service-types", serviceTypeRoutes)
router.use("/reports", reportRoutes)
router.use("/regions", regionRoutes)
router.use("/taxi-zones", taxiZoneRoutes)
router.use("/taxi-stands", taxiStandRoutes)
router.use("/recommendations", recommendationRoutes)
router.use("/stores", storeRoutes)
router.use("/house-moving", houseMovingRoutes)
router.use("/users", userRoutes)
router.use("/notifications", notificationRoutes)
router.use("/locations", locationRoutes)
router.use("/anonymous", anonymousRoutes)

export default router
