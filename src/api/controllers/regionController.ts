//Region Controller
import { prisma } from "../../config/prisma"
import type { Request, Response } from "express"

// List all top-level regions
export const listRegions = async (req: Request, res: Response) => {
  try {
    const { type, parentId } = req.query

    const whereClause: any = {}

    if (type) {
      whereClause.type = type
    }

    if (parentId) {
      whereClause.parentId = parentId
    } else {
      // If no parentId specified, get top-level regions
      whereClause.parentId = null
    }

    const regions = await prisma.region.findMany({
      where: whereClause,
      orderBy: {
        name: "asc",
      },
    })

    res.json(regions)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get region details
export const getRegionDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const region = await prisma.region.findUnique({
      where: { id },
      include: {
        parent: true,
      },
    })

    if (!region) {
      return res.status(404).json({ error: "Region not found" })
    }

    res.json(region)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get child regions
export const getChildRegions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const children = await prisma.region.findMany({
      where: { parentId: id },
      orderBy: {
        name: "asc",
      },
    })

    res.json(children)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get districts in a region
export const getRegionDistricts = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const districts = await prisma.district.findMany({
      where: { regionId: id },
      include: {
        region: true,
      },
      orderBy: {
        name: "asc",
      },
    })

    res.json(districts)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get district details
export const getDistrictDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const district = await prisma.district.findUnique({
      where: { id },
      include: {
        region: true,
      },
    })

    if (!district) {
      return res.status(404).json({ error: "District not found" })
    }

    res.json(district)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// List available drivers in a district
export const listDistrictDrivers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { date } = req.query

    // Check if district exists
    const district = await prisma.district.findUnique({
      where: { id },
    })

    if (!district) {
      return res.status(404).json({ error: "District not found" })
    }

    const whereClause: any = {
      isAvailableForDayBooking: true,
      approvalStatus: "APPROVED",
      driverDistricts: {
        some: {
          districtId: id,
        },
      },
    }

    // If date is provided, check availability for that date
    if (date) {
      const bookingDate = new Date(date as string)
      const formattedDate = bookingDate.toISOString().split("T")[0]

      whereClause.driverAvailability = {
        some: {
          date: {
            gte: new Date(`${formattedDate}T00:00:00Z`),
            lt: new Date(`${formattedDate}T23:59:59Z`),
          },
          isAvailable: true,
        },
      }

      // Ensure driver is not already booked for this date
      whereClause.NOT = {
        services: {
          some: {
            scheduledTime: {
              gte: new Date(`${formattedDate}T00:00:00Z`),
              lt: new Date(`${formattedDate}T23:59:59Z`),
            },
            status: {
              in: ["SCHEDULED", "DRIVER_ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"],
            },
            serviceType: {
              category: "DAY_BOOKING",
            },
          },
        },
      }
    }

    const drivers = await prisma.driverProfile.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            profileImage: true,
            phone: true,
          },
        },
        vehicle: true,
        driverDistricts: {
          where: {
            districtId: id,
          },
        },
      },
    })

    // Format response with pricing
    const formattedDrivers = drivers.map((driver) => ({
      id: driver.id,
      name: `${driver.user.firstName} ${driver.user.lastName}`,
      profileImage: driver.user.profileImage,
      phone: driver.user.phone,
      rating: driver.rating,
      totalTrips: driver.totalTrips,
      vehicle: driver.vehicle
        ? {
            make: driver.vehicle.make,
            model: driver.vehicle.model,
            color: driver.vehicle.color,
            year: driver.vehicle.year,
          }
        : null,
      price: driver.dayBookingPrice,
      districtPrice: driver.driverDistricts[0]?.customPrice || driver.dayBookingPrice,
    }))

    res.json(formattedDrivers)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
