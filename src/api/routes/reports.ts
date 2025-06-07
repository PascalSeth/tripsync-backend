//reports.ts
import { Router } from "express"
import { getReports, getReport, updateReportStatus, getReportTypes } from "../controllers/reportController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Admin Report Routes
router.get("/admin/reports", requireAuth(), getReports)
router.get("/admin/reports/types", requireAuth(), getReportTypes)
router.get("/admin/reports/:id", requireAuth(), getReport)
router.put("/admin/reports/:id/status", requireAuth(), updateReportStatus)

export default router
