import { Router } from "express"
import {
  getMovingCompanies,
  estimateMovingCost,
  bookMovingService,
  getMovingServiceDetails,
  updateInventoryItems,
  trackMovingService,
  updateMovingStatus,
  cancelMovingService,
} from "../controllers/houseMovingController"
import { requireAuth } from "@clerk/express"
import { driverOnly } from "../controllers/serviceController"

const router = Router()

// User routes
router.get("/companies", getMovingCompanies)
router.post("/estimate", requireAuth(), estimateMovingCost)
router.post("/book", requireAuth(), bookMovingService)
router.get("/:id", requireAuth(), getMovingServiceDetails)
router.post("/:id/inventory", requireAuth(), updateInventoryItems)
router.get("/:id/track", requireAuth(), trackMovingService)
router.post("/:id/cancel", requireAuth(), cancelMovingService)

// Driver/Company routes
router.put("/:id/status", requireAuth(), driverOnly, updateMovingStatus)

export default router
