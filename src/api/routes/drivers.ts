//drivers.ts 
import { Router } from "express"
import {
  createDriverProfile,
  updateDriverProfile,
  getDriverProfile,
  updateDriverStatus,
  updateDriverLocation,
  toggleDriverAvailability,
  getDriverBookings,
  getDriverEarnings,
} from "../controllers/driverController"
import { authMiddleware, driverOnly } from "../middlewares/authMiddleware"

const router = Router()

// Profile routes
router.post("/", authMiddleware, driverOnly, createDriverProfile)
router.put("/", authMiddleware, driverOnly, updateDriverProfile)
router.get("/", authMiddleware, driverOnly, getDriverProfile)
router.patch("/status", authMiddleware, driverOnly, updateDriverStatus)

// Location routes
router.put("/location", authMiddleware, driverOnly, updateDriverLocation)

// Availability routes
router.put("/availability", authMiddleware, driverOnly, toggleDriverAvailability)

// Booking routes
router.get("/bookings", authMiddleware, driverOnly, getDriverBookings)

// Earnings routes
router.get("/earnings", authMiddleware, driverOnly, getDriverEarnings)

export default router