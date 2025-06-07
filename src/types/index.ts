// types/express.d.ts
import { Request } from "express";
import { Permission, UserRole } from "@prisma/client";
import { DriverProfile, EmergencyResponderProfile } from "@prisma/client";

declare module "express" {
  interface Request {
    user?: {
      userId: string;
      role: UserRole;
      permissions: Permission[];
    };
    driver?: DriverProfile;
    responder?: EmergencyResponderProfile;
  }
}