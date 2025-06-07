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
import { requireAuth } from "@clerk/express"

const router = Router()

// Service Type Routes
router.post("/", requireAuth(), createServiceType)
router.get("/", requireAuth(), getServiceTypes)
router.get("/:id", requireAuth(), getServiceType)
router.put("/:id", requireAuth(), updateServiceType)
router.delete("/:id", requireAuth(), deleteServiceType)

// Driver Assignment Routes
router.post("/assign-driver", requireAuth(), assignDriverToServiceType)
router.delete("/:serviceTypeId/drivers/:driverProfileId", requireAuth(), removeDriverFromServiceType)
router.get("/:id/drivers", requireAuth(), getDriversForServiceType)

export default router
