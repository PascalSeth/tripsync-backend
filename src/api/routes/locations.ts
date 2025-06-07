//locations.ts
import { Router } from "express"
import {
  createLocation,
  geocodeLocation,
  reverseGeocodeLocation,
  getRouteDetails,
  findNearbyLocations,
  checkLocationInZone,
} from "../controllers/locationMapboxController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Mapbox-powered Location Routes
router.post("/", requireAuth(), createLocation)
router.post("/geocode", requireAuth(), geocodeLocation)
router.post("/reverse-geocode", requireAuth(), reverseGeocodeLocation)
router.post("/route", requireAuth(), getRouteDetails)
router.get("/nearby", requireAuth(), findNearbyLocations)
router.get("/:locationId/in-zone/:zoneId", requireAuth(), checkLocationInZone)

export default router
