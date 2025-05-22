import { Router } from "express"
import { createLocation, getLocations, getGeocode } from "../controllers/locationController"
import { requireAuth } from "@clerk/express"

const router = Router()

router.post("/", requireAuth(), createLocation)
router.get("/", requireAuth(), getLocations)
router.post("/geocode", requireAuth(), getGeocode)

export default router
