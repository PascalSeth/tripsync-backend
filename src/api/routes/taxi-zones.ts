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
import { requireAuth } from "@clerk/express"

const router = Router()

// Taxi Zone Routes
router.post("/", requireAuth(), createTaxiZone)
router.get("/", requireAuth(), getTaxiZones)
router.get("/:id", requireAuth(), getTaxiZone)
router.get("/:id/analytics", requireAuth(), getTaxiZoneAnalytics)
router.put("/:id", requireAuth(), updateTaxiZone)
router.delete("/:id", requireAuth(), deleteTaxiZone)

// Mapbox-powered Taxi Zone Routes
router.post("/find-for-location", requireAuth(), findZoneForLocation)
router.get("/:zoneId/overlaps", requireAuth(), getZoneOverlap)

export default router
