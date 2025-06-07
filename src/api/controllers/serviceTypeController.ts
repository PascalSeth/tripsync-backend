//serviceTypeController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createServiceTypeSchema = z.object({
  name: z.string().min(2),
  category: z.enum(["RIDE", "TAXI", "DAY_BOOKING", "STORE_DELIVERY", "HOUSE_MOVING", "EMERGENCY", "SHARED_RIDE"]),
  description: z.string().optional(),
  basePrice: z.number().positive(),
  pricePerKm: z.number().positive().optional(),
  pricePerMinute: z.number().positive().optional(),
  pricePerHour: z.number().positive().optional(),
  hasFixedRoutes: z.boolean().optional().default(false),
  maxCapacity: z.number().int().positive().optional().default(1),
  isActive: z.boolean().optional().default(true),
})

export const updateServiceTypeSchema = createServiceTypeSchema.partial()

// Service Type Management
export const createServiceType = async (req: Request, res: Response) => {
  try {
    const data = createServiceTypeSchema.parse(req.body)

    // Check if name is already in use
    const existingServiceType = await prisma.serviceType.findUnique({
      where: { name: data.name },
    })

    if (existingServiceType) {
      return res.status(400).json({ error: "Service type name already in use" })
    }

    const serviceType = await prisma.serviceType.create({
      data,
    })

    res.status(201).json(serviceType)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getServiceTypes = async (req: Request, res: Response) => {
  try {
    const { category, isActive } = req.query

    const whereClause: any = {}

    if (category) {
      whereClause.category = category
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    const serviceTypes = await prisma.serviceType.findMany({
      where: whereClause,
      orderBy: { name: "asc" },
    })

    res.json(serviceTypes)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getServiceType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const serviceType = await prisma.serviceType.findUnique({
      where: { id },
      include: {
        services: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
          take: 5,
          orderBy: { createdAt: "desc" },
        },
        assignedDrivers: {
          include: {
            driverProfile: {
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
          take: 5,
        },
      },
    })

    if (!serviceType) {
      return res.status(404).json({ error: "Service type not found" })
    }

    // Get counts
    const [servicesCount, driversCount] = await Promise.all([
      prisma.service.count({
        where: { serviceTypeId: id },
      }),
      prisma.assignedDriverType.count({
        where: { serviceTypeId: id },
      }),
    ])

    res.json({
      ...serviceType,
      _count: {
        services: servicesCount,
        assignedDrivers: driversCount,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateServiceType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateServiceTypeSchema.parse(req.body)

    // Check if service type exists
    const serviceType = await prisma.serviceType.findUnique({
      where: { id },
    })

    if (!serviceType) {
      return res.status(404).json({ error: "Service type not found" })
    }

    // Check if name is already in use by another service type
    if (data.name && data.name !== serviceType.name) {
      const existingServiceType = await prisma.serviceType.findUnique({
        where: { name: data.name },
      })

      if (existingServiceType && existingServiceType.id !== id) {
        return res.status(400).json({ error: "Service type name already in use" })
      }
    }

    const updatedServiceType = await prisma.serviceType.update({
      where: { id },
      data,
    })

    res.json(updatedServiceType)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteServiceType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if service type is in use
    const servicesUsingType = await prisma.service.count({
      where: { serviceTypeId: id },
    })

    if (servicesUsingType > 0) {
      return res.status(400).json({
        error: "Cannot delete service type that is in use by services",
        servicesCount: servicesUsingType,
      })
    }

    // Check if drivers are assigned to this service type
    const driversAssigned = await prisma.assignedDriverType.count({
      where: { serviceTypeId: id },
    })

    if (driversAssigned > 0) {
      return res.status(400).json({
        error: "Cannot delete service type that has drivers assigned",
        driversCount: driversAssigned,
      })
    }

    await prisma.serviceType.delete({
      where: { id },
    })

    res.json({ message: "Service type deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const assignDriverToServiceType = async (req: Request, res: Response) => {
  try {
    const { serviceTypeId, driverProfileId } = req.body

    // Check if service type exists
    const serviceType = await prisma.serviceType.findUnique({
      where: { id: serviceTypeId },
    })

    if (!serviceType) {
      return res.status(404).json({ error: "Service type not found" })
    }

    // Check if driver exists
    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
    })

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" })
    }

    // Check if assignment already exists
    const existingAssignment = await prisma.assignedDriverType.findUnique({
      where: {
        driverProfileId_serviceTypeId: {
          driverProfileId,
          serviceTypeId,
        },
      },
    })

    if (existingAssignment) {
      // Update existing assignment
      const updatedAssignment = await prisma.assignedDriverType.update({
        where: {
          driverProfileId_serviceTypeId: {
            driverProfileId,
            serviceTypeId,
          },
        },
        data: {
          isActive: true,
        },
      })

      return res.json(updatedAssignment)
    }

    // Create new assignment
    const assignment = await prisma.assignedDriverType.create({
      data: {
        driverProfileId,
        serviceTypeId,
      },
    })

    res.status(201).json(assignment)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const removeDriverFromServiceType = async (req: Request, res: Response) => {
  try {
    const { serviceTypeId, driverProfileId } = req.params

    // Check if assignment exists
    const assignment = await prisma.assignedDriverType.findUnique({
      where: {
        driverProfileId_serviceTypeId: {
          driverProfileId,
          serviceTypeId,
        },
      },
    })

    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" })
    }

    // Instead of deleting, set isActive to false
    const updatedAssignment = await prisma.assignedDriverType.update({
      where: {
        driverProfileId_serviceTypeId: {
          driverProfileId,
          serviceTypeId,
        },
      },
      data: {
        isActive: false,
      },
    })

    res.json({ message: "Driver removed from service type", assignment: updatedAssignment })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getDriversForServiceType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { isActive } = req.query

    const whereClause: any = {
      serviceTypeId: id,
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    const assignments = await prisma.assignedDriverType.findMany({
      where: whereClause,
      include: {
        driverProfile: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                profileImage: true,
              },
            },
            vehicle: true,
          },
        },
      },
    })

    res.json(assignments)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
