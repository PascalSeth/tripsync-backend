//emergency.ts
import { Router } from "express"
import {
  requestEmergencyService,
  getEmergencyServiceDetails,
  updateEmergencyStatus,
  getEmergencyHistory,
  cancelEmergencyRequest,
} from "../controllers/emergencyController"
import { authMiddleware, driverOnly } from "../middlewares/authMiddleware"

const router = Router()

// User routes
router.post("/request", authMiddleware, requestEmergencyService)
router.get("/:id", authMiddleware, getEmergencyServiceDetails)
router.get("/history", authMiddleware, getEmergencyHistory)
router.post("/:id/cancel", authMiddleware, cancelEmergencyRequest)

// Driver routes
router.put("/:id/status", authMiddleware, driverOnly, updateEmergencyStatus)

export default router
