import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { Permission, UserRole, DriverProfile, EmergencyResponderProfile } from "@prisma/client";

// Define AuthRequest interface
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: UserRole;
    permissions: Permission[];
  };
  driver?: DriverProfile; // Add driver property
  responder?: EmergencyResponderProfile; // Add responder property
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };

    // Get user with role
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "User not found or inactive" });
    }

    // Get permissions for user role
    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        role: user.role,
        isActive: true,
      },
      select: { permission: true },
    });

    req.user = {
      userId: user.id,
      role: user.role,
      permissions: rolePermissions.map((rp) => rp.permission),
    };

    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Permission checking middleware
export const requirePermission = (permission: Permission) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
};

// Role checking middleware
export const requireRole = (roles: UserRole | UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient role" });
    }

    next();
  };
};

// Super admin only middleware
export const superAdminOnly = requireRole("SUPER_ADMIN");

// City admin or super admin middleware
export const cityAdminOrAbove = requireRole(["SUPER_ADMIN", "CITY_ADMIN"]);

// Store owner middleware
export const storeOwnerOnly = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.user.role !== "STORE_OWNER" && req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Store owner access required" });
  }

  // For store owners, verify they own the store being accessed
  if (req.user.role === "STORE_OWNER" && req.params.storeId) {
    const storeOwner = await prisma.storeOwnerProfile.findUnique({
      where: { userId: req.user.userId },
      include: { stores: { select: { id: true } } },
    });

    if (!storeOwner || !storeOwner.stores.some((store) => store.id === req.params.storeId)) {
      return res.status(403).json({ error: "Access denied to this store" });
    }
  }

  next();
};

// Place owner middleware
export const placeOwnerOnly = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.user.role !== "PLACE_OWNER" && req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Place owner access required" });
  }

  // For place owners, verify they own the place being accessed
  if (req.user.role === "PLACE_OWNER" && req.params.placeId) {
    const placeOwner = await prisma.placeOwnerProfile.findUnique({
      where: { userId: req.user.userId },
      include: { places: { select: { id: true } } },
    });

    if (!placeOwner || !placeOwner.places.some((place) => place.id === req.params.placeId)) {
      return res.status(403).json({ error: "Access denied to this place" });
    }
  }

  next();
};

// Driver middleware (enhanced)
export const driverOnly = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const driver = await prisma.driverProfile.findUnique({
    where: { userId: req.user.userId },
  });

  if (!driver) {
    return res.status(403).json({ error: "Driver profile required" });
  }

  if (driver.approvalStatus !== "APPROVED") {
    return res.status(403).json({ error: "Driver not approved" });
  }

  // Add driver info to request
  req.driver = driver;
  next();
};

// Emergency responder middleware
export const emergencyResponderOnly = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.user.role !== "EMERGENCY_RESPONDER" && req.user.role !== "EMERGENCY_ADMIN") {
    return res.status(403).json({ error: "Emergency responder access required" });
  }

  const responder = await prisma.emergencyResponderProfile.findUnique({
    where: { userId: req.user.userId },
  });

  if (!responder) {
    return res.status(403).json({ error: "Emergency responder profile required" });
  }

  // Add responder info to request
  req.responder = responder;
  next();
};