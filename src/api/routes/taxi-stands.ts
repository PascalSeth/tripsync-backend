//taxi-stands.ts
import { Router } from "express"
import {
  createTaxiStand,
  getTaxiStands,
  getTaxiStand,
  updateTaxiStand,
  deleteTaxiStand,
} from "../controllers/taxiStandController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Taxi Stand Routes
router.post("/", requireAuth(), createTaxiStand)
router.get("/", requireAuth(), getTaxiStands)
router.get("/:id", requireAuth(), getTaxiStand)
router.put("/:id", requireAuth(), updateTaxiStand)
router.delete("/:id", requireAuth(), deleteTaxiStand)

export default router
