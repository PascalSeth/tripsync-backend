//services.ts
import { Router } from "express"
import {
  requestRide,
  acceptRide,
  updateServiceStatus,
  driverOnly,
  updateDriverLocation,
  getServiceHistory,
  getService,
} from "../controllers/serviceController"
import { authMiddleware } from "../middlewares/authMiddleware"

const router = Router()

router.post("/request",authMiddleware, requestRide)
router.post("/accept",authMiddleware, driverOnly, acceptRide)
router.put("/status",authMiddleware, driverOnly, updateServiceStatus)
router.put("/driver/location",authMiddleware, driverOnly, updateDriverLocation)
router.get("/history",authMiddleware, getServiceHistory)
router.get("/:id",authMiddleware, getService)

export default router
