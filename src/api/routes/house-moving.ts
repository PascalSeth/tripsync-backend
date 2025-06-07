//house-moving.ts
import { Router } from "express"
import {
  createMovingCompany,
  getMovingCompanies,
  getMovingCompany,
  updateMovingCompany,
  deleteMovingCompany,
  getMovingCompanyAnalytics,
} from "../controllers/movingCompanyController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Moving Company Routes
router.post("/companies", requireAuth(), createMovingCompany)
router.get("/companies", requireAuth(), getMovingCompanies)
router.get("/companies/:id", requireAuth(), getMovingCompany)
router.get("/companies/:id/analytics", requireAuth(), getMovingCompanyAnalytics)
router.put("/companies/:id", requireAuth(), updateMovingCompany)
router.delete("/companies/:id", requireAuth(), deleteMovingCompany)

export default router
