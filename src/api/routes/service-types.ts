//service-types.ts
import { Router } from "express"
import {
  createServiceType,
  getServiceTypes,
  getServiceType,
  updateServiceType,
  deleteServiceType,
  assignDriverToServiceType,
  removeDriverFromServiceType,
  getDriversForServiceType,
} from "../controllers/serviceTypeController"
import { authMiddleware } from "../middlewares/authMiddleware"

const router = Router()

// Service Type Routes
router.post("/", authMiddleware, createServiceType)
router.get("/", authMiddleware, getServiceTypes)
router.get("/:id", authMiddleware, getServiceType)
router.put("/:id", authMiddleware, updateServiceType)
router.delete("/:id", authMiddleware, deleteServiceType)

// Driver Assignment Routes
router.post("/assign-driver", authMiddleware, assignDriverToServiceType)
router.delete("/:serviceTypeId/drivers/:driverProfileId", authMiddleware, removeDriverFromServiceType)
router.get("/:id/drivers", authMiddleware, getDriversForServiceType)

export default router
