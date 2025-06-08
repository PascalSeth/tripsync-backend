//taxi-stands.ts
import { Router } from "express"
import {
  createTaxiStand,
  getTaxiStands,
  getTaxiStand,
  updateTaxiStand,
  deleteTaxiStand,
} from "../controllers/taxiStandController"
import { cityAdminOrAbove } from "../middlewares/authMiddleware"

const router = Router()

// Taxi Stand Routes
router.post("/", cityAdminOrAbove, createTaxiStand)
router.get("/", cityAdminOrAbove, getTaxiStands)
router.get("/:id", cityAdminOrAbove, getTaxiStand)
router.put("/:id", cityAdminOrAbove, updateTaxiStand)
router.delete("/:id", cityAdminOrAbove, deleteTaxiStand)

export default router
