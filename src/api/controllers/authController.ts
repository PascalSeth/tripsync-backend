//Auth Controller
import { prisma } from "../../config/prisma"
import { clerkClient } from "@clerk/express"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import { env } from "../../config/env"
import { z } from "zod"

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(10),
})

export const driverRegisterSchema = registerSchema.extend({
  driversLicense: z.string(),
  nationalId: z.string(),
  registrationPic: z.string(),
  driverPic: z.string(),
  licenseExpiryDate: z.string().datetime(),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const register = async (data: z.infer<typeof registerSchema>) => {
  try {
    // Create user in Clerk
    const clerkUser = await clerkClient.users
      .createUser({
        emailAddress: [data.email],
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        skipPasswordChecks: false, // Ensure Clerk validates password
      })
      .catch((error: any) => {
        const message = error.errors?.[0]?.message || error.message || "Unknown Clerk error"
        const status = error.status || 500
        throw new Error(`Clerk createUser failed: ${message} (Status: ${status})`)
      })

    // Hash password for database
    const hashedPassword = await bcrypt.hash(data.password, 10)

    // Create user in database with hashed password
    const user = await prisma.user.create({
      data: {
        id: clerkUser.id,
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
    })

    // Generate JWT
    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: "1d" })
    return { user, token }
  } catch (error: any) {
    throw new Error(`Registration failed: ${error.message}`)
  }
}

export const registerDriver = async (data: z.infer<typeof driverRegisterSchema>) => {
  try {
    // Create user in Clerk
    const clerkUser = await clerkClient.users
      .createUser({
        emailAddress: [data.email],
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        skipPasswordChecks: false,
      })
      .catch((error: any) => {
        const message = error.errors?.[0]?.message || error.message || "Unknown Clerk error"
        const status = error.status || 500
        throw new Error(`Clerk createUser failed: ${message} (Status: ${status})`)
      })

    // Hash password for database
    const hashedPassword = await bcrypt.hash(data.password, 10)

    // Create user and driver profile in database with hashed password
    const user = await prisma.user.create({
      data: {
        id: clerkUser.id,
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
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
    return { user, token }
  } catch (error: any) {
    throw new Error(`Driver registration failed: ${error.message}`)
  }
}

export const login = async (data: z.infer<typeof loginSchema>) => {
  // Verify with Clerk
  const clerkUsers = await clerkClient.users.getUserList({ emailAddress: [data.email] })
  const clerkUser = clerkUsers.data?.[0]
  if (!clerkUser) {
    throw new Error("User not found")
  }

  // Verify password in database
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { driver: true },
  })

  if (!user) {
    throw new Error("User not found in database")
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.password)
  if (!isPasswordValid) {
    throw new Error("Invalid password")
  }

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: "1d" })
  return { user, token }
}
