//shared-rides.ts
import { Router } from "express"
import {
  estimateSharedRide,
  bookSharedRide,
  getSharedRideDetails,
  checkGroupStatus,
  leaveSharedRide,
} from "../controllers/sharedRideController"
import { authMiddleware } from "../middlewares/authMiddleware"

const router = Router()

router.post("/estimate",authMiddleware, estimateSharedRide)
router.post("/book",authMiddleware, bookSharedRide)
router.get("/:id",authMiddleware, getSharedRideDetails)
router.get("/:id/status",authMiddleware, checkGroupStatus)
router.post("/:id/leave",authMiddleware, leaveSharedRide)

export default router
