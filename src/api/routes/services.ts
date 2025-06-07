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
import { requireAuth } from "@clerk/express"

const router = Router()

router.post("/request", requireAuth(), requestRide)
router.post("/accept", requireAuth(), driverOnly, acceptRide)
router.put("/status", requireAuth(), driverOnly, updateServiceStatus)
router.put("/driver/location", requireAuth(), driverOnly, updateDriverLocation)
router.get("/history", requireAuth(), getServiceHistory)
router.get("/:id", requireAuth(), getService)

export default router
