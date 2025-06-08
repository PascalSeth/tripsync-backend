//Auth Controller
import { prisma } from "../../config/prisma"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import { env } from "../../config/env"
import { z } from "zod"
import type { UserRole } from "@prisma/client"

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(10),
  role: z.enum(["USER", "DRIVER", "STORE_OWNER", "PLACE_OWNER"]).optional().default("USER"),
})

export const driverRegisterSchema = registerSchema.extend({
  driversLicense: z.string(),
  nationalId: z.string(),
  registrationPic: z.string(),
  driverPic: z.string(),
  licenseExpiryDate: z.string().datetime(),
  role: z.literal("DRIVER"),
})

export const storeOwnerRegisterSchema = registerSchema.extend({
  businessLicense: z.string(),
  taxId: z.string().optional(),
  businessType: z.string(),
  role: z.literal("STORE_OWNER"),
})

export const placeOwnerRegisterSchema = registerSchema.extend({
  businessLicense: z.string().optional(),
  subscriptionTier: z.enum(["BASIC", "PREMIUM", "ENTERPRISE"]).optional().default("BASIC"),
  role: z.literal("PLACE_OWNER"),
})

export const emergencyResponderRegisterSchema = registerSchema.extend({
  badgeNumber: z.string(),
  department: z.string(),
  specialization: z.enum(["POLICE", "AMBULANCE", "FIRE", "RESCUE"]),
  certifications: z.array(z.string()),
  role: z.literal("EMERGENCY_RESPONDER"),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const twoFactorSchema = z.object({
  token: z.string().length(6),
  secret: z.string(),
})

export const register = async (data: z.infer<typeof registerSchema>) => {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new Error("User already exists with this email")
    }

    // Hash password for database
    const hashedPassword = await bcrypt.hash(data.password, 10)

    // Create user in database
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role as UserRole,
      },
    })

    // Generate JWT
    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: "1d" })

    // Create user session
    await prisma.userSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    })

    return { user, token }
  } catch (error: any) {
    throw new Error(`Registration failed: ${error.message}`)
  }
}

export const registerDriver = async (data: z.infer<typeof driverRegisterSchema>) => {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new Error("User already exists with this email")
    }

    // Hash password for database
    const hashedPassword = await bcrypt.hash(data.password, 10)

    // Create user and driver profile in database
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: "DRIVER",
        driver: {
          create: {
            driversLicense: data.driversLicense,
            nationalId: data.nationalId,
            registrationPic: data.registrationPic,
            driverPic: data.driverPic,
            licenseExpiryDate: new Date(data.licenseExpiryDate),
          },
        },
      },
      include: { driver: true },
    })

    // Generate JWT
    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: "1d" })

    // Create user session
    await prisma.userSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    return { user, token }
  } catch (error: any) {
    throw new Error(`Driver registration failed: ${error.message}`)
  }
}

export const registerStoreOwner = async (data: z.infer<typeof storeOwnerRegisterSchema>) => {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new Error("User already exists with this email")
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: "STORE_OWNER",
        storeOwner: {
          create: {
            businessLicense: data.businessLicense,
            taxId: data.taxId,
            businessType: data.businessType,
          },
        },
      },
      include: { storeOwner: true },
    })

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: "1d" })

    await prisma.userSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    return { user, token }
  } catch (error: any) {
    throw new Error(`Store owner registration failed: ${error.message}`)
  }
}

export const registerPlaceOwner = async (data: z.infer<typeof placeOwnerRegisterSchema>) => {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new Error("User already exists with this email")
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: "PLACE_OWNER",
        placeOwner: {
          create: {
            businessLicense: data.businessLicense,
            subscriptionTier: data.subscriptionTier,
            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        },
      },
      include: { placeOwner: true },
    })

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: "1d" })

    await prisma.userSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    return { user, token }
  } catch (error: any) {
    throw new Error(`Place owner registration failed: ${error.message}`)
  }
}

export const registerEmergencyResponder = async (data: z.infer<typeof emergencyResponderRegisterSchema>) => {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new Error("User already exists with this email")
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: "EMERGENCY_RESPONDER",
        emergencyResponder: {
          create: {
            badgeNumber: data.badgeNumber,
            department: data.department,
            specialization: data.specialization,
            certifications: data.certifications,
          },
        },
      },
      include: { emergencyResponder: true },
    })

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: "1d" })

    await prisma.userSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    return { user, token }
  } catch (error: any) {
    throw new Error(`Emergency responder registration failed: ${error.message}`)
  }
}

export const login = async (data: z.infer<typeof loginSchema>) => {
  // Find user in database
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: {
      driver: true,
      storeOwner: true,
      placeOwner: true,
      emergencyResponder: true,
    },
  })

  if (!user || !user.isActive) {
    throw new Error("User not found or inactive")
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.password)
  if (!isPasswordValid) {
    throw new Error("Invalid password")
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: "1d" })

  // Create user session
  await prisma.userSession.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  return { user, token }
}

export const logout = async (token: string) => {
  try {
    // Deactivate session
    await prisma.userSession.updateMany({
      where: { token },
      data: { isActive: false },
    })

    return { message: "Logged out successfully" }
  } catch (error: any) {
    throw new Error(`Logout failed: ${error.message}`)
  }
}

export const setupTwoFactor = async (userId: string) => {
  try {
    const speakeasy = require("speakeasy")

    const secret = speakeasy.generateSecret({
      name: "TripSync",
      account: userId,
    })

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    })

    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url,
    }
  } catch (error: any) {
    throw new Error(`Two-factor setup failed: ${error.message}`)
  }
}

export const verifyTwoFactor = async (userId: string, data: z.infer<typeof twoFactorSchema>) => {
  try {
    const speakeasy = require("speakeasy")

    const verified = speakeasy.totp.verify({
      secret: data.secret,
      encoding: "base32",
      token: data.token,
      window: 2,
    })

    if (verified) {
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      })
    }

    return { verified }
  } catch (error: any) {
    throw new Error(`Two-factor verification failed: ${error.message}`)
  }
}
