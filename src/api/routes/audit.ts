// Audit Routes - New file
import { Router } from "express"
import { getAuditLogs, getAuditLog, getAuditStatistics } from "../controllers/auditController"
import { authMiddleware, requirePermission } from "../middlewares/authMiddleware"

const router = Router()

// Get audit logs
router.get("/", authMiddleware, requirePermission("VIEW_SYSTEM_ANALYTICS"), getAuditLogs)

// Get audit log by ID
router.get("/:id", authMiddleware, requirePermission("VIEW_SYSTEM_ANALYTICS"), getAuditLog)

// Get audit statistics
router.get("/statistics", authMiddleware, requirePermission("VIEW_SYSTEM_ANALYTICS"), getAuditStatistics)

export default router
