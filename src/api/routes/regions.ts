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
import { authMiddleware, cityAdminOrAbove } from "../middlewares/authMiddleware"

const router = Router()

// Region Routes
router.post("/", authMiddleware,cityAdminOrAbove, createRegion)
router.get("/", authMiddleware,cityAdminOrAbove, getRegions)
router.get("/hierarchy", authMiddleware,cityAdminOrAbove, getRegionHierarchy)
router.get("/:id", authMiddleware,cityAdminOrAbove, getRegion)
router.put("/:id", authMiddleware,cityAdminOrAbove, updateRegion)
router.delete("/:id", authMiddleware,cityAdminOrAbove, deleteRegion)

// District Routes
router.post("/districts", authMiddleware,cityAdminOrAbove, createDistrict)
router.get("/districts", authMiddleware,cityAdminOrAbove, getDistricts)
router.get("/districts/:id", authMiddleware,cityAdminOrAbove, getDistrict)
router.put("/districts/:id", authMiddleware,cityAdminOrAbove, updateDistrict)
router.delete("/districts/:id", authMiddleware,cityAdminOrAbove, deleteDistrict)

export default router
