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
import { driverOnly } from "../controllers/serviceController"
import { authMiddleware } from "../middlewares/authMiddleware"

const router = Router()

// User routes
router.get("/availability", authMiddleware,driverOnly, checkDriverAvailability)
router.get("/pricing", authMiddleware,driverOnly, getDayBookingPricing)
router.post("/book", authMiddleware,driverOnly, bookDriverForDay)
router.get("/history", authMiddleware,driverOnly, getBookingHistory)

// Driver routes
router.post("/set-price", authMiddleware,driverOnly, driverOnly, setDriverPrice)
router.post("/schedule", authMiddleware,driverOnly, driverOnly, setDriverSchedule)

export default router
