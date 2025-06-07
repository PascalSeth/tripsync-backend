//delivery.ts
import { Router } from "express"
import {
  estimateDelivery,
  createDeliveryOrder,
  getDeliveryDetails,
  updateDeliveryStatus,
  getDeliveryHistory,
} from "../controllers/deliveryController"
import { requireAuth } from "@clerk/express"
import { driverOnly } from "../controllers/serviceController"

const router = Router()

// Customer routes
router.post("/estimate", requireAuth(), estimateDelivery)
router.post("/order", requireAuth(), createDeliveryOrder)
router.get("/:id", requireAuth(), getDeliveryDetails)
router.get("/history", requireAuth(), getDeliveryHistory)

// Driver routes
router.put("/:id/status", requireAuth(), driverOnly, updateDeliveryStatus)

export default router
