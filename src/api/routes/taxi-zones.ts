//taxi-zones.ts
import { Router } from "express"
import {
  createTaxiZone,
  getTaxiZones,
  getTaxiZone,
  updateTaxiZone,
  deleteTaxiZone,
  getTaxiZoneAnalytics,
} from "../controllers/taxiZoneController"
import { findZoneForLocation, getZoneOverlap } from "../controllers/taxiZoneMapboxController"
import { cityAdminOrAbove } from "../middlewares/authMiddleware"

const router = Router()

// Taxi Zone Routes
router.post("/", cityAdminOrAbove, createTaxiZone)
router.get("/", cityAdminOrAbove, getTaxiZones)
router.get("/:id", cityAdminOrAbove, getTaxiZone)
router.get("/:id/analytics", cityAdminOrAbove, getTaxiZoneAnalytics)
router.put("/:id", cityAdminOrAbove, updateTaxiZone)
router.delete("/:id", cityAdminOrAbove, deleteTaxiZone)

// Mapbox-powered Taxi Zone Routes
router.post("/find-for-location", cityAdminOrAbove, findZoneForLocation)
router.get("/:zoneId/overlaps", cityAdminOrAbove, getZoneOverlap)

export default router
