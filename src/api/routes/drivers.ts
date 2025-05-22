import { Router } from "express"
import {
  createDriverProfile,
  updateDriverProfile,
  getDriverProfile,
  updateDriverStatus,
} from "../controllers/driverController"
import { requireAuth } from "@clerk/express"

const router = Router()

router.post("/", requireAuth(), createDriverProfile)
router.put("/", requireAuth(), updateDriverProfile)
router.get("/", requireAuth(), getDriverProfile)
router.patch("/status", requireAuth(), updateDriverStatus)

export default router
