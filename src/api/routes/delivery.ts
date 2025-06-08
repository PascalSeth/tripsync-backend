//delivery.ts
import { Router } from "express"
import {
  estimateDelivery,
  createDeliveryOrder,
  getDeliveryDetails,
  updateDeliveryStatus,
  getDeliveryHistory,
} from "../controllers/deliveryController"
import { driverOnly } from "../controllers/serviceController"
import { authMiddleware } from "../middlewares/authMiddleware"

const router = Router()

// Customer routes
router.post("/estimate", authMiddleware, estimateDelivery)
router.post("/order", authMiddleware, createDeliveryOrder)
router.get("/:id", authMiddleware, getDeliveryDetails)
router.get("/history", authMiddleware, getDeliveryHistory)

// Driver routes
router.put("/:id/status", authMiddleware, driverOnly, updateDeliveryStatus)

export default router
