//taxiZoneMapboxController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import { isPointInPolygon } from "../../config/mapbox"

// Schemas
export const findZoneForLocationSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
})

// Taxi Zone Mapbox Integration
export const findZoneForLocation = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude } = findZoneForLocationSchema.parse(req.body)

    // Get all zones with boundaries
    const zones = await prisma.taxiZone.findMany({
      where: {
        boundaries: {
          not: null,
        },
      },
    })

    // Find zone that contains the point
    let matchingZone = null

    for (const zone of zones) {
      if (!zone.boundaries) continue

      // Parse boundaries
      const boundaries = JSON.parse(zone.boundaries) as [number, number][][]

      // Check if point is in zone
      const isInZone = isPointInPolygon([longitude, latitude], boundaries)

      if (isInZone) {
        matchingZone = zone
        break
      }
    }

    if (!matchingZone) {
      return res.json({ found: false, message: "Location is not in any defined zone" })
    }

    res.json({
      found: true,
      zone: matchingZone,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getZoneOverlap = async (req: Request, res: Response) => {
  try {
    const { zoneId } = req.params

    // Get zone
    const zone = await prisma.taxiZone.findUnique({
      where: { id: zoneId },
    })

    if (!zone || !zone.boundaries) {
      return res.status(404).json({ error: "Zone not found or has no boundaries" })
    }

    // Get all other zones with boundaries
    const otherZones = await prisma.taxiZone.findMany({
      where: {
        id: { not: zoneId },
        boundaries: { not: null },
      },
    })

    // This is a simplified approach - in production, you would use
    // proper geospatial functions to calculate polygon intersections
    // Here we're just checking if any points from one polygon are in the other
    const overlappingZones = []

    const zoneBoundaries = JSON.parse(zone.boundaries) as [number, number][][]

    for (const otherZone of otherZones) {
      if (!otherZone.boundaries) continue

      const otherBoundaries = JSON.parse(otherZone.boundaries) as [number, number][][]

      // Check if any point from zone is in otherZone
      let hasOverlap = false

      // Sample a few points from the zone boundary
      for (let i = 0; i < zoneBoundaries[0].length; i += 3) {
        // Check every 3rd point to save time
        const point = zoneBoundaries[0][i]

        if (isPointInPolygon(point, otherBoundaries)) {
          hasOverlap = true
          break
        }
      }

      if (hasOverlap) {
        overlappingZones.push(otherZone)
      }
    }

    res.json({
      zone,
      overlappingZones,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
