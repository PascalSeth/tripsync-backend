// RBAC Routes - New file
import { Router } from "express"
import {
  initializeRolePermissions,
  getRolesAndPermissions,
  assignUserRole,
  updateRolePermissions,
  getUserPermissions,
  checkUserPermission,
  getUsersByRole,
} from "../controllers/rbacController"
import { authMiddleware, superAdminOnly, requirePermission } from "../middlewares/authMiddleware"

const router = Router()

// Initialize default role permissions (super admin only)
router.post("/initialize", authMiddleware, superAdminOnly, initializeRolePermissions)

// Get all roles and permissions
router.get("/roles-permissions", authMiddleware, requirePermission("MANAGE_USER_ROLES"), getRolesAndPermissions)

// Assign role to user
router.post("/assign-role", authMiddleware, requirePermission("MANAGE_USER_ROLES"), assignUserRole)

// Update permissions for a role
router.put("/role-permissions", authMiddleware, superAdminOnly, updateRolePermissions)

// Get user permissions
router.get("/user/:userId/permissions", authMiddleware, requirePermission("READ_USER"), getUserPermissions)

// Check if user has specific permission
router.get("/user/:userId/permission/:permission", authMiddleware, requirePermission("READ_USER"), checkUserPermission)

// Get users by role
router.get("/role/:role/users", authMiddleware, requirePermission("READ_USER"), getUsersByRole)

export default router
