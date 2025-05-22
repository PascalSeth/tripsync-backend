import { Router } from "express"
import { createTaxiStand, getTaxiStands, getNearbyStands } from "../controllers/taxiStandController"
import { requireAuth } from "@clerk/express"

const router = Router()

router.get("/", getTaxiStands)
router.post("/", requireAuth(), createTaxiStand)
router.post("/nearby", getNearbyStands)

export default router
