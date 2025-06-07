//vehicleController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createVehicleTypeSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
})

export const updateVehicleTypeSchema = createVehicleTypeSchema.partial()

export const createVehicleSchema = z.object({
  registrationNumber: z.string().min(3),
  make: z.string().min(2),
  model: z.string().min(2),
  year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1),
  color: z.string().min(2),
  seats: z.number().int().min(1),
  vehicleTypeId: z.string().uuid(),
  insuranceNumber: z.string().min(3),
  insuranceExpiryDate: z.string().datetime(),
  inspectionDate: z.string().datetime(),
  photos: z.array(z.string()).optional(),
})

export const updateVehicleSchema = createVehicleSchema.partial()

// Vehicle Type Management
export const createVehicleType = async (req: Request, res: Response) => {
  try {
    const data = createVehicleTypeSchema.parse(req.body)

    const vehicleType = await prisma.vehicleType.create({
      data,
    })

    res.status(201).json(vehicleType)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getVehicleTypes = async (req: Request, res: Response) => {
  try {
    const vehicleTypes = await prisma.vehicleType.findMany({
      orderBy: { name: "asc" },
    })

    res.json(vehicleTypes)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getVehicleType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const vehicleType = await prisma.vehicleType.findUnique({
      where: { id },
    })

    if (!vehicleType) {
      return res.status(404).json({ error: "Vehicle type not found" })
    }

    res.json(vehicleType)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateVehicleType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateVehicleTypeSchema.parse(req.body)

    const vehicleType = await prisma.vehicleType.update({
      where: { id },
      data,
    })

    res.json(vehicleType)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteVehicleType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if vehicle type is in use
    const vehiclesUsingType = await prisma.vehicle.count({
      where: { vehicleTypeId: id },
    })

    if (vehiclesUsingType > 0) {
      return res.status(400).json({
        error: "Cannot delete vehicle type that is in use by vehicles",
        vehiclesCount: vehiclesUsingType,
      })
    }

    await prisma.vehicleType.delete({
      where: { id },
    })

    res.json({ message: "Vehicle type deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Vehicle Management
export const createVehicle = async (req: Request, res: Response) => {
  try {
    const data = createVehicleSchema.parse(req.body)

    // Check if vehicle type exists
    const vehicleType = await prisma.vehicleType.findUnique({
      where: { id: data.vehicleTypeId },
    })

    if (!vehicleType) {
      return res.status(400).json({ error: "Vehicle type not found" })
    }

    // Check if registration number is already in use
    const existingVehicle = await prisma.vehicle.findUnique({
      where: { registrationNumber: data.registrationNumber },
    })

    if (existingVehicle) {
      return res.status(400).json({ error: "Registration number already in use" })
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        ...data,
        insuranceExpiryDate: new Date(data.insuranceExpiryDate),
        inspectionDate: new Date(data.inspectionDate),
        photos: data.photos || [],
      },
    })

    res.status(201).json(vehicle)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getVehicles = async (req: Request, res: Response) => {
  try {
    const { type, isActive } = req.query

    const whereClause: any = {}

    if (type) {
      whereClause.vehicleTypeId = type
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    const vehicles = await prisma.vehicle.findMany({
      where: whereClause,
      include: {
        vehicleType: true,
        driverProfiles: {
          select: {
            id: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { registrationNumber: "asc" },
    })

    res.json(vehicles)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        vehicleType: true,
        driverProfiles: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    })

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" })
    }

    res.json(vehicle)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateVehicleSchema.parse(req.body)

    // Check if vehicle exists
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
    })

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" })
    }

    // Check if registration number is already in use by another vehicle
    if (data.registrationNumber && data.registrationNumber !== vehicle.registrationNumber) {
      const existingVehicle = await prisma.vehicle.findUnique({
        where: { registrationNumber: data.registrationNumber },
      })

      if (existingVehicle && existingVehicle.id !== id) {
        return res.status(400).json({ error: "Registration number already in use" })
      }
    }

    // Check if vehicle type exists
    if (data.vehicleTypeId) {
      const vehicleType = await prisma.vehicleType.findUnique({
        where: { id: data.vehicleTypeId },
      })

      if (!vehicleType) {
        return res.status(400).json({ error: "Vehicle type not found" })
      }
    }

    const updatedVehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        ...data,
        insuranceExpiryDate: data.insuranceExpiryDate ? new Date(data.insuranceExpiryDate) : undefined,
        inspectionDate: data.inspectionDate ? new Date(data.inspectionDate) : undefined,
      },
      include: {
        vehicleType: true,
      },
    })

    res.json(updatedVehicle)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if vehicle is assigned to any drivers
    const driversUsingVehicle = await prisma.driverProfile.count({
      where: { vehicleId: id },
    })

    if (driversUsingVehicle > 0) {
      return res.status(400).json({
        error: "Cannot delete vehicle that is assigned to drivers",
        driversCount: driversUsingVehicle,
      })
    }

    await prisma.vehicle.delete({
      where: { id },
    })

    res.json({ message: "Vehicle deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getExpiringDocuments = async (req: Request, res: Response) => {
  try {
    const { days = "30" } = req.query
    const daysAhead = Number.parseInt(days as string) || 30

    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + daysAhead)

    const vehicles = await prisma.vehicle.findMany({
      where: {
        OR: [
          {
            insuranceExpiryDate: {
              lte: expiryDate,
            },
          },
          {
            inspectionDate: {
              lte: expiryDate,
            },
          },
        ],
      },
      include: {
        vehicleType: true,
        driverProfiles: {
          select: {
            id: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    })

    // Group by expiry type
    const expiringInsurance = vehicles
      .filter((v) => v.insuranceExpiryDate <= expiryDate)
      .map((v) => ({
        ...v,
        expiryType: "insurance",
        daysRemaining: Math.ceil((v.insuranceExpiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
      }))

    const expiringInspection = vehicles
      .filter((v) => v.inspectionDate <= expiryDate)
      .map((v) => ({
        ...v,
        expiryType: "inspection",
        daysRemaining: Math.ceil((v.inspectionDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
      }))

    res.json({
      expiringInsurance,
      expiringInspection,
      total: expiringInsurance.length + expiringInspection.length,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
