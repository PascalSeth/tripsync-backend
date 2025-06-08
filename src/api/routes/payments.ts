//payments.ts
import { Router } from "express"
import { initializePayment, verifyPayment } from "../controllers/paymentController"
import { authMiddleware } from "../middlewares/authMiddleware"

const router = Router()

router.post("/initialize", authMiddleware, initializePayment)
router.post("/webhook", verifyPayment)

export default router
