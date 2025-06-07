// RBAC Controller - New file for role and permission management
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import type { UserRole, Permission } from "@prisma/client"

// Schemas
export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum([
    "SUPER_ADMIN",
    "CITY_ADMIN",
    "EMERGENCY_ADMIN",
    "PLACE_OWNER",
    "STORE_OWNER",
    "DRIVER",
    "USER",
    "EMERGENCY_RESPONDER",
    "DISPATCHER",
    "SUPPORT_AGENT",
  ]),
})

export const updateRolePermissionsSchema = z.object({
  role: z.enum([
    "SUPER_ADMIN",
    "CITY_ADMIN",
    "EMERGENCY_ADMIN",
    "PLACE_OWNER",
    "STORE_OWNER",
    "DRIVER",
    "USER",
    "EMERGENCY_RESPONDER",
    "DISPATCHER",
    "SUPPORT_AGENT",
  ]),
  permissions: z.array(z.string()),
})

// Initialize default role permissions
export const initializeRolePermissions = async (req: Request, res: Response) => {
  try {
    const defaultPermissions = {
      SUPER_ADMIN: [
        "CREATE_USER",
        "READ_USER",
        "UPDATE_USER",
        "DELETE_USER",
        "MANAGE_USER_ROLES",
        "APPROVE_DRIVER",
        "SUSPEND_DRIVER",
        "VIEW_DRIVER_ANALYTICS",
        "MANAGE_DRIVER_SHIFTS",
        "CREATE_STORE",
        "UPDATE_STORE",
        "DELETE_STORE",
        "MANAGE_STORE_PRODUCTS",
        "VIEW_STORE_ANALYTICS",
        "CREATE_PLACE",
        "UPDATE_PLACE",
        "DELETE_PLACE",
        "APPROVE_PLACE",
        "MANAGE_PLACE_PHOTOS",
        "CREATE_SERVICE",
        "UPDATE_SERVICE",
        "CANCEL_SERVICE",
        "ASSIGN_DRIVER",
        "DISPATCH_EMERGENCY",
        "MANAGE_RESPONDERS",
        "VIEW_EMERGENCY_ANALYTICS",
        "COORDINATE_INCIDENTS",
        "VIEW_PAYMENTS",
        "PROCESS_REFUNDS",
        "MANAGE_COMMISSIONS",
        "VIEW_FINANCIAL_REPORTS",
        "MANAGE_SYSTEM_CONFIG",
        "VIEW_SYSTEM_ANALYTICS",
        "MANAGE_REGIONS",
        "MANAGE_SERVICE_TYPES",
        "MODERATE_REVIEWS",
        "MANAGE_NOTIFICATIONS",
        "HANDLE_REPORTS",
      ],
      CITY_ADMIN: [
        "READ_USER",
        "UPDATE_USER",
        "APPROVE_DRIVER",
        "SUSPEND_DRIVER",
        "VIEW_DRIVER_ANALYTICS",
        "APPROVE_PLACE",
        "MANAGE_PLACE_PHOTOS",
        "ASSIGN_DRIVER",
        "VIEW_PAYMENTS",
        "VIEW_FINANCIAL_REPORTS",
        "VIEW_SYSTEM_ANALYTICS",
        "MANAGE_REGIONS",
        "MODERATE_REVIEWS",
        "HANDLE_REPORTS",
      ],
      EMERGENCY_ADMIN: [
        "DISPATCH_EMERGENCY",
        "MANAGE_RESPONDERS",
        "VIEW_EMERGENCY_ANALYTICS",
        "COORDINATE_INCIDENTS",
        "ASSIGN_DRIVER",
        "VIEW_SYSTEM_ANALYTICS",
      ],
      PLACE_OWNER: ["CREATE_PLACE", "UPDATE_PLACE", "MANAGE_PLACE_PHOTOS"],
      STORE_OWNER: ["CREATE_STORE", "UPDATE_STORE", "MANAGE_STORE_PRODUCTS", "VIEW_STORE_ANALYTICS"],
      DRIVER: ["CREATE_SERVICE", "UPDATE_SERVICE"],
      USER: ["CREATE_SERVICE", "READ_USER"],
      EMERGENCY_RESPONDER: ["UPDATE_SERVICE", "VIEW_EMERGENCY_ANALYTICS"],
      DISPATCHER: ["DISPATCH_EMERGENCY", "ASSIGN_DRIVER", "COORDINATE_INCIDENTS"],
      SUPPORT_AGENT: ["READ_USER", "HANDLE_REPORTS", "MODERATE_REVIEWS"],
    }

    // Clear existing permissions
    await prisma.rolePermission.deleteMany()

    // Create new permissions
    const permissionsToCreate = []
    for (const [role, permissions] of Object.entries(defaultPermissions)) {
      for (const permission of permissions) {
        permissionsToCreate.push({
          role: role as UserRole,
          permission: permission as Permission,
        })
      }
    }

    await prisma.rolePermission.createMany({
      data: permissionsToCreate,
    })

    res.json({
      message: "Role permissions initialized successfully",
      permissionsCreated: permissionsToCreate.length,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get all roles and their permissions
export const getRolesAndPermissions = async (req: Request, res: Response) => {
  try {
    const rolePermissions = await prisma.rolePermission.findMany({
      where: { isActive: true },
      orderBy: [{ role: "asc" }, { permission: "asc" }],
    })

    // Group by role
    const groupedPermissions = rolePermissions.reduce(
      (acc, rp) => {
        if (!acc[rp.role]) {
          acc[rp.role] = []
        }
        acc[rp.role].push(rp.permission)
        return acc
      },
      {} as Record<UserRole, Permission[]>,
    )

    res.json(groupedPermissions)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Assign role to user
export const assignUserRole = async (req: Request, res: Response) => {
  try {
    const data = assignRoleSchema.parse(req.body)

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
    })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: data.userId },
      data: { role: data.role },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    })

    // Create notification
    await prisma.notification.create({
      data: {
        userId: data.userId,
        title: "Role Updated",
        body: `Your role has been updated to ${data.role}`,
        type: "SYSTEM",
      },
    })

    res.json({
      message: "Role assigned successfully",
      user: updatedUser,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Update permissions for a role
export const updateRolePermissions = async (req: Request, res: Response) => {
  try {
    const data = updateRolePermissionsSchema.parse(req.body)

    // Remove existing permissions for this role
    await prisma.rolePermission.deleteMany({
      where: { role: data.role },
    })

    // Add new permissions
    const permissionsToCreate = data.permissions.map((permission) => ({
      role: data.role,
      permission: permission as Permission,
    }))

    await prisma.rolePermission.createMany({
      data: permissionsToCreate,
    })

    res.json({
      message: "Role permissions updated successfully",
      role: data.role,
      permissions: data.permissions,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get user permissions
export const getUserPermissions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        role: user.role,
        isActive: true,
      },
      select: { permission: true },
    })

    res.json({
      userId,
      role: user.role,
      permissions: rolePermissions.map((rp) => rp.permission),
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Check if user has specific permission
export const checkUserPermission = async (req: Request, res: Response) => {
  try {
    const { userId, permission } = req.params

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const hasPermission = await prisma.rolePermission.findFirst({
      where: {
        role: user.role,
        permission: permission as Permission,
        isActive: true,
      },
    })

    res.json({
      userId,
      permission,
      hasPermission: !!hasPermission,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get users by role
export const getUsersByRole = async (req: Request, res: Response) => {
  try {
    const { role } = req.params
    const page = Number.parseInt(req.query.page as string) || 1
    const limit = Number.parseInt(req.query.limit as string) || 20

    const users = await prisma.user.findMany({
      where: {
        role: role as UserRole,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    })

    const total = await prisma.user.count({
      where: {
        role: role as UserRole,
        isActive: true,
      },
    })

    res.json({
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
