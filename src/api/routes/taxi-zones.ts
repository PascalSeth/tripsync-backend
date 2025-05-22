import { Router } from "express"
import { createTaxiZone, getTaxiZones, getZonePrice } from "../controllers/taxiZoneController"
import { requireAuth } from "@clerk/express"

const router = Router()

router.get("/", getTaxiZones)
router.post("/", requireAuth(), createTaxiZone)
router.post("/price", getZonePrice)

export default router
