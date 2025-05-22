import { Router } from "express"
import {
  requestEmergencyService,
  getEmergencyServiceDetails,
  updateEmergencyStatus,
  getEmergencyHistory,
  cancelEmergencyRequest,
} from "../controllers/emergencyController"
import { requireAuth } from "@clerk/express"
import { driverOnly } from "../controllers/serviceController"

const router = Router()

// User routes
router.post("/request", requireAuth(), requestEmergencyService)
router.get("/:id", requireAuth(), getEmergencyServiceDetails)
router.get("/history", requireAuth(), getEmergencyHistory)
router.post("/:id/cancel", requireAuth(), cancelEmergencyRequest)

// Driver routes
router.put("/:id/status", requireAuth(), driverOnly, updateEmergencyStatus)

export default router
