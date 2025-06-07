//regions.ts
import { Router } from "express"
import {
  createRegion,
  getRegions,
  getRegionHierarchy,
  getRegion,
  updateRegion,
  deleteRegion,
  createDistrict,
  getDistricts,
  getDistrict,
  updateDistrict,
  deleteDistrict,
} from "../controllers/locationController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Region Routes
router.post("/", requireAuth(), createRegion)
router.get("/", requireAuth(), getRegions)
router.get("/hierarchy", requireAuth(), getRegionHierarchy)
router.get("/:id", requireAuth(), getRegion)
router.put("/:id", requireAuth(), updateRegion)
router.delete("/:id", requireAuth(), deleteRegion)

// District Routes
router.post("/districts", requireAuth(), createDistrict)
router.get("/districts", requireAuth(), getDistricts)
router.get("/districts/:id", requireAuth(), getDistrict)
router.put("/districts/:id", requireAuth(), updateDistrict)
router.delete("/districts/:id", requireAuth(), deleteDistrict)

export default router
