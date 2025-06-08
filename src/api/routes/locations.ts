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
import { authMiddleware } from "../middlewares/authMiddleware"

const router = Router()

// Mapbox-powered Location Routes
router.post("/", authMiddleware, createLocation)
router.post("/geocode", authMiddleware, geocodeLocation)
router.post("/reverse-geocode", authMiddleware, reverseGeocodeLocation)
router.post("/route", authMiddleware, getRouteDetails)
router.get("/nearby", authMiddleware, findNearbyLocations)
router.get("/:locationId/in-zone/:zoneId", authMiddleware, checkLocationInZone)

export default router
