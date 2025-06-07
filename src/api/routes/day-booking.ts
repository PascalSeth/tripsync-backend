//day-booking.ts
import { Router } from "express"
import {
  checkDriverAvailability,
  getDayBookingPricing,
  setDriverPrice,
  setDriverSchedule,
  bookDriverForDay,
  getBookingHistory,
} from "../controllers/dayBookingController"
import { requireAuth } from "@clerk/express"
import { driverOnly } from "../controllers/serviceController"

const router = Router()

// User routes
router.get("/availability", requireAuth(), checkDriverAvailability)
router.get("/pricing", requireAuth(), getDayBookingPricing)
router.post("/book", requireAuth(), bookDriverForDay)
router.get("/history", requireAuth(), getBookingHistory)

// Driver routes
router.post("/set-price", requireAuth(), driverOnly, setDriverPrice)
router.post("/schedule", requireAuth(), driverOnly, setDriverSchedule)

export default router
