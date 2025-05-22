import { Router } from "express"
import {
  listRegions,
  getRegionDetails,
  getChildRegions,
  getRegionDistricts,
  getDistrictDetails,
  listDistrictDrivers,
} from "../controllers/regionController"

const router = Router()

// Region routes
router.get("/", listRegions)
router.get("/:id", getRegionDetails)
router.get("/:id/children", getChildRegions)
router.get("/:id/districts", getRegionDistricts)

// District routes
router.get("/districts/:id", getDistrictDetails)
router.get("/districts/:id/drivers", listDistrictDrivers)

export default router
