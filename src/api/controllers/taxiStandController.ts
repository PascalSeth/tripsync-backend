//taxiStandController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createTaxiStandSchema = z.object({
  name: z.string().min(2),
  locationId: z.string().uuid(),
  capacity: z.number().int().positive(),
  isActive: z.boolean().optional(),
})

export const updateTaxiStandSchema = createTaxiStandSchema.partial()

// Taxi Stand Management
export const createTaxiStand = async (req: Request, res: Response) => {
  try {
    const data = createTaxiStandSchema.parse(req.body)

    // Check if location exists
    const location = await prisma.location.findUnique({
      where: { id: data.locationId },
    })

    if (!location) {
      return res.status(400).json({ error: "Location not found" })
    }

    const taxiStand = await prisma.taxiStand.create({
      data,
      include: {
        location: true,
      },
    })

    res.status(201).json(taxiStand)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getTaxiStands = async (req: Request, res: Response) => {
  try {
    const { isActive } = req.query

    const whereClause: any = {}

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    const taxiStands = await prisma.taxiStand.findMany({
      where: whereClause,
      include: {
        location: true,
      },
      orderBy: { name: "asc" },
    })

    // Calculate current occupancy for each stand
    const standsWithOccupancy = await Promise.all(
      taxiStands.map(async (stand) => {
        // For demonstration, we'll use a random number for occupancy
        // In a real implementation, this would be calculated based on drivers at the stand
        const currentOccupancy = Math.floor(Math.random() * (stand.capacity + 1))

        return {
          ...stand,
          currentOccupancy,
          occupancyRate: stand.capacity > 0 ? currentOccupancy / stand.capacity : 0,
        }
      }),
    )

    res.json(standsWithOccupancy)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getTaxiStand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const taxiStand = await prisma.taxiStand.findUnique({
      where: { id },
      include: {
        location: true,
      },
    })

    if (!taxiStand) {
      return res.status(404).json({ error: "Taxi stand not found" })
    }

    // For demonstration, we'll use a random number for occupancy
    // In a real implementation, this would be calculated based on drivers at the stand
    const currentOccupancy = Math.floor(Math.random() * (taxiStand.capacity + 1))

    // Get nearby drivers
    const nearbyDrivers = await prisma.driverProfile.findMany({
      where: {
        currentStatus: "ONLINE",
        // In a real implementation, we would use geospatial queries to find drivers near the stand
        // For demonstration, we'll use a hardcoded list
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        vehicle: true,
      },
      take: 5,
    })

    res.json({
      ...taxiStand,
      currentOccupancy,
      occupancyRate: taxiStand.capacity > 0 ? currentOccupancy / taxiStand.capacity : 0,
      nearbyDrivers,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateTaxiStand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateTaxiStandSchema.parse(req.body)

    // Check if taxi stand exists
    const taxiStand = await prisma.taxiStand.findUnique({
      where: { id },
    })

    if (!taxiStand) {
      return res.status(404).json({ error: "Taxi stand not found" })
    }

    // Check if location exists if provided
    if (data.locationId) {
      const location = await prisma.location.findUnique({
        where: { id: data.locationId },
      })

      if (!location) {
        return res.status(400).json({ error: "Location not found" })
      }
    }

    const updatedTaxiStand = await prisma.taxiStand.update({
      where: { id },
      data,
      include: {
        location: true,
      },
    })

    res.json(updatedTaxiStand)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteTaxiStand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.taxiStand.delete({
      where: { id },
    })

    res.json({ message: "Taxi stand deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
