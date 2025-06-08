import { Router } from "express"
import {
  createMovingCompany,
  getMovingCompanies,
  getMovingCompany,
  updateMovingCompany,
  deleteMovingCompany,
  getMovingCompanyAnalytics,
} from "../controllers/movingCompanyController"
import { authMiddleware, superAdminOnly } from "../middlewares/authMiddleware"

const router = Router()

// Moving Company Routes
router.post("/companies", authMiddleware, superAdminOnly, createMovingCompany)
router.get("/companies", authMiddleware, getMovingCompanies)
router.get("/companies/:id", authMiddleware, getMovingCompany)
router.get("/companies/:id/analytics", authMiddleware, superAdminOnly, getMovingCompanyAnalytics)
router.put("/companies/:id", authMiddleware, superAdminOnly, updateMovingCompany)
router.delete("/companies/:id", authMiddleware, superAdminOnly, deleteMovingCompany)

export default router
