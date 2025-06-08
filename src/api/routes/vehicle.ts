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
import { authMiddleware, superAdminOnly } from "../middlewares/authMiddleware"

const router = Router()

// Vehicle Type Routes
router.post("/types", authMiddleware,superAdminOnly, createVehicleType)
router.get("/types", authMiddleware,superAdminOnly, getVehicleTypes)
router.get("/types/:id", authMiddleware,superAdminOnly, getVehicleType)
router.put("/types/:id", authMiddleware,superAdminOnly, updateVehicleType)
router.delete("/types/:id", authMiddleware,superAdminOnly, deleteVehicleType)

// Vehicle Routes
router.post("/", authMiddleware,superAdminOnly, createVehicle)
router.get("/", authMiddleware,superAdminOnly, getVehicles)
router.get("/expiring-documents", authMiddleware,superAdminOnly, getExpiringDocuments)
router.get("/:id", authMiddleware,superAdminOnly, getVehicle)
router.put("/:id", authMiddleware,superAdminOnly, updateVehicle)
router.delete("/:id", authMiddleware,superAdminOnly, deleteVehicle)

export default router
