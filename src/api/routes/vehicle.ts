//vehicle.ts
import { Router } from "express"
import {
  createVehicleType,
  getVehicleTypes,
  getVehicleType,
  updateVehicleType,
  deleteVehicleType,
  createVehicle,
  getVehicles,
  getVehicle,
  updateVehicle,
  deleteVehicle,
  getExpiringDocuments,
} from "../controllers/vehicleController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Vehicle Type Routes
router.post("/types", requireAuth(), createVehicleType)
router.get("/types", requireAuth(), getVehicleTypes)
router.get("/types/:id", requireAuth(), getVehicleType)
router.put("/types/:id", requireAuth(), updateVehicleType)
router.delete("/types/:id", requireAuth(), deleteVehicleType)

// Vehicle Routes
router.post("/", requireAuth(), createVehicle)
router.get("/", requireAuth(), getVehicles)
router.get("/expiring-documents", requireAuth(), getExpiringDocuments)
router.get("/:id", requireAuth(), getVehicle)
router.put("/:id", requireAuth(), updateVehicle)
router.delete("/:id", requireAuth(), deleteVehicle)

export default router
