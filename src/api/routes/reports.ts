//reports.ts
import { Router } from "express"
import { getReports, getReport, updateReportStatus, getReportTypes } from "../controllers/reportController"
import { authMiddleware, superAdminOnly } from "../middlewares/authMiddleware"


const router = Router()

// Admin Report Routes
router.get("/admin/reports", authMiddleware,superAdminOnly, getReports)
router.get("/admin/reports/types", authMiddleware,superAdminOnly, getReportTypes)
router.get("/admin/reports/:id", authMiddleware,superAdminOnly, getReport)
router.put("/admin/reports/:id/status", authMiddleware,superAdminOnly, updateReportStatus)

export default router
