//payments.ts
import { Router } from "express"
import { initializePayment, verifyPayment } from "../controllers/paymentController"
import { requireAuth } from "@clerk/express"

const router = Router()

router.post("/initialize", requireAuth(), initializePayment)
router.post("/webhook", verifyPayment)

export default router
