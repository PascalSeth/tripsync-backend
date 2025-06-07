//locationController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createRegionSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["COUNTRY", "STATE", "CITY", "DISTRICT"]),
  parentId: z.string().uuid().optional(),
  code: z.string().optional(),
})

export const updateRegionSchema = createRegionSchema.partial()

export const createDistrictSchema = z.object({
  name: z.string().min(2),
  regionId: z.string().uuid(),
  boundaries: z.string().optional(), // GeoJSON data
})

export const updateDistrictSchema = createDistrictSchema.partial()

// Region Management
export const createRegion = async (req: Request, res: Response) => {
  try {
    const data = createRegionSchema.parse(req.body)

    // Check if parent exists if parentId is provided
    if (data.parentId) {
      const parentRegion = await prisma.region.findUnique({
        where: { id: data.parentId },
      })

      if (!parentRegion) {
        return res.status(400).json({ error: "Parent region not found" })
      }
    }

    // Check for unique name within the same parent and type
    const existingRegion = await prisma.region.findFirst({
      where: {
        name: data.name,
        type: data.type,
        parentId: data.parentId,
      },
    })

    if (existingRegion) {
      return res.status(400).json({ error: "Region with this name already exists within the same parent and type" })
    }

    const region = await prisma.region.create({
      data,
    })

    res.status(201).json(region)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getRegions = async (req: Request, res: Response) => {
  try {
    const { type, parentId } = req.query

    const whereClause: any = {}

    if (type) {
      whereClause.type = type
    }

    if (parentId === "null") {
      whereClause.parentId = null
    } else if (parentId) {
      whereClause.parentId = parentId
    }

    const regions = await prisma.region.findMany({
      where: whereClause,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        _count: {
          select: {
            children: true,
            districts: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    })

    res.json(regions)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getRegionHierarchy = async (req: Request, res: Response) => {
  try {
    // Get all root-level regions (no parent)
    const rootRegions = await prisma.region.findMany({
      where: { parentId: null },
      orderBy: { name: "asc" },
    })

    // For each root region, recursively fetch children
    const hierarchy = await Promise.all(
      rootRegions.map(async (region) => {
        return {
          ...region,
          children: await getChildRegions(region.id),
        }
      }),
    )

    res.json(hierarchy)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Helper function to recursively get child regions
async function getChildRegions(parentId: string): Promise<any[]> {
  const children = await prisma.region.findMany({
    where: { parentId },
    orderBy: { name: "asc" },
  })

  return Promise.all(
    children.map(async (child) => {
      return {
        ...child,
        children: await getChildRegions(child.id),
      }
    }),
  )
}

export const getRegion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const region = await prisma.region.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          orderBy: { name: "asc" },
        },
        districts: {
          orderBy: { name: "asc" },
        },
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

export const updateRegion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateRegionSchema.parse(req.body)

    // Check if region exists
    const region = await prisma.region.findUnique({
      where: { id },
    })

    if (!region) {
      return res.status(404).json({ error: "Region not found" })
    }

    // Prevent circular hierarchy
    if (data.parentId === id) {
      return res.status(400).json({ error: "Region cannot be its own parent" })
    }

    // Check if new parent exists
    if (data.parentId && data.parentId !== region.parentId) {
      const parentRegion = await prisma.region.findUnique({
        where: { id: data.parentId },
      })

      if (!parentRegion) {
        return res.status(400).json({ error: "Parent region not found" })
      }

      // Prevent deeper circular references
      if (await isDescendant(id, data.parentId)) {
        return res.status(400).json({ error: "Cannot set a descendant as parent" })
      }
    }

    // Check for unique name within the same parent and type
    if (data.name && data.name !== region.name) {
      const existingRegion = await prisma.region.findFirst({
        where: {
          name: data.name,
          type: data.type || region.type,
          parentId: data.parentId || region.parentId,
          id: { not: id },
        },
      })

      if (existingRegion) {
        return res.status(400).json({ error: "Region with this name already exists within the same parent and type" })
      }
    }

    const updatedRegion = await prisma.region.update({
      where: { id },
      data,
      include: {
        parent: true,
      },
    })

    res.json(updatedRegion)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Helper to check if potentialAncestor is a descendant of regionId
async function isDescendant(regionId: string, potentialDescendant: string): Promise<boolean> {
  if (regionId === potentialDescendant) return true

  const descendants = await prisma.region.findMany({
    where: { parentId: regionId },
    select: { id: true },
  })

  for (const descendant of descendants) {
    if (await isDescendant(descendant.id, potentialDescendant)) {
      return true
    }
  }

  return false
}

export const deleteRegion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if region has children
    const childrenCount = await prisma.region.count({
      where: { parentId: id },
    })

    if (childrenCount > 0) {
      return res.status(400).json({
        error: "Cannot delete region that has child regions",
        childrenCount,
      })
    }

    // Check if region has districts
    const districtsCount = await prisma.district.count({
      where: { regionId: id },
    })

    if (districtsCount > 0) {
      return res.status(400).json({
        error: "Cannot delete region that has districts",
        districtsCount,
      })
    }

    await prisma.region.delete({
      where: { id },
    })

    res.json({ message: "Region deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// District Management
export const createDistrict = async (req: Request, res: Response) => {
  try {
    const data = createDistrictSchema.parse(req.body)

    // Check if region exists
    const region = await prisma.region.findUnique({
      where: { id: data.regionId },
    })

    if (!region) {
      return res.status(400).json({ error: "Region not found" })
    }

    // Check for unique name within the same region
    const existingDistrict = await prisma.district.findFirst({
      where: {
        name: data.name,
        regionId: data.regionId,
      },
    })

    if (existingDistrict) {
      return res.status(400).json({ error: "District with this name already exists within the same region" })
    }

    const district = await prisma.district.create({
      data,
      include: {
        region: true,
      },
    })

    res.status(201).json(district)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getDistricts = async (req: Request, res: Response) => {
  try {
    const { regionId } = req.query

    const whereClause: any = {}

    if (regionId) {
      whereClause.regionId = regionId
    }

    const districts = await prisma.district.findMany({
      where: whereClause,
      include: {
        region: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        _count: {
          select: {
            dayBookings: true,
            driverDistricts: true,
          },
        },
      },
      orderBy: { name: "asc" },
    })

    res.json(districts)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getDistrict = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const district = await prisma.district.findUnique({
      where: { id },
      include: {
        region: true,
        driverDistricts: {
          include: {
            driver: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!district) {
      return res.status(404).json({ error: "District not found" })
    }

    // Get day booking count
    const dayBookingsCount = await prisma.service.count({
      where: {
        districtId: id,
        serviceType: {
          category: "DAY_BOOKING",
        },
      },
    })

    res.json({
      ...district,
      _count: {
        dayBookings: dayBookingsCount,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateDistrict = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateDistrictSchema.parse(req.body)

    // Check if district exists
    const district = await prisma.district.findUnique({
      where: { id },
    })

    if (!district) {
      return res.status(404).json({ error: "District not found" })
    }

    // Check if new region exists
    if (data.regionId && data.regionId !== district.regionId) {
      const region = await prisma.region.findUnique({
        where: { id: data.regionId },
      })

      if (!region) {
        return res.status(400).json({ error: "Region not found" })
      }
    }

    // Check for unique name within the same region
    if (data.name && data.name !== district.name) {
      const existingDistrict = await prisma.district.findFirst({
        where: {
          name: data.name,
          regionId: data.regionId || district.regionId,
          id: { not: id },
        },
      })

      if (existingDistrict) {
        return res.status(400).json({ error: "District with this name already exists within the same region" })
      }
    }

    const updatedDistrict = await prisma.district.update({
      where: { id },
      data,
      include: {
        region: true,
      },
    })

    res.json(updatedDistrict)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteDistrict = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if district has day bookings
    const dayBookingsCount = await prisma.service.count({
      where: {
        districtId: id,
        serviceType: {
          category: "DAY_BOOKING",
        },
      },
    })

    if (dayBookingsCount > 0) {
      return res.status(400).json({
        error: "Cannot delete district that has day bookings",
        dayBookingsCount,
      })
    }

    // Check if district has driver assignments
    const driverDistrictsCount = await prisma.driverDistrict.count({
      where: { districtId: id },
    })

    if (driverDistrictsCount > 0) {
      return res.status(400).json({
        error: "Cannot delete district that has driver assignments",
        driverDistrictsCount,
      })
    }

    await prisma.district.delete({
      where: { id },
    })

    res.json({ message: "District deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
