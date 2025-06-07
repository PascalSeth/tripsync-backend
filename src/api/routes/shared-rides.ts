//shared-rides.ts
import { Router } from "express"
import {
  estimateSharedRide,
  bookSharedRide,
  getSharedRideDetails,
  checkGroupStatus,
  leaveSharedRide,
} from "../controllers/sharedRideController"
import { requireAuth } from "@clerk/express"

const router = Router()

router.post("/estimate", requireAuth(), estimateSharedRide)
router.post("/book", requireAuth(), bookSharedRide)
router.get("/:id", requireAuth(), getSharedRideDetails)
router.get("/:id/status", requireAuth(), checkGroupStatus)
router.post("/:id/leave", requireAuth(), leaveSharedRide)

export default router
