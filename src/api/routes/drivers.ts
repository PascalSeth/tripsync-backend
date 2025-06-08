//drivers.ts 
import { Router } from "express"
import {
  createDriverProfile,
  updateDriverProfile,
  getDriverProfile,
  updateDriverStatus,
} from "../controllers/driverController"
import { authMiddleware, driverOnly } from "../middlewares/authMiddleware"

const router = Router()

router.post("/", authMiddleware,driverOnly, createDriverProfile)
router.put("/", authMiddleware,driverOnly, updateDriverProfile)
router.get("/", authMiddleware,driverOnly, getDriverProfile)
router.patch("/status", authMiddleware,driverOnly, updateDriverStatus)

export default router
