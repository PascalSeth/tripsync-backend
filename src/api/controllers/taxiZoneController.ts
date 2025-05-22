//Taxi Zone Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import { isPointInPolygon } from "geolib"

export const createTaxiZoneSchema = z.object({
  name: z.string(),
  basePrice: z.number().positive(),
  boundaries: z.string(), // GeoJSON
})

export const getPriceSchema = z.object({
  pickup: z.object({ latitude: z.number(), longitude: z.number() }),
  dropoff: z.object({ latitude: z.number(), longitude: z.number() }),
})

export const createTaxiZone = async (req: Request, res: Response) => {
  try {
    const data = createTaxiZoneSchema.parse(req.body)
    const zone = await prisma.taxiZone.create({
      data: {
        name: data.name,
        basePrice: data.basePrice,
        boundaries: data.boundaries,
      },
    })
    res.status(201).json(zone)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getTaxiZones = async (req: Request, res: Response) => {
  const zones = await prisma.taxiZone.findMany()
  res.json(zones)
}

export const getZonePrice = async (req: Request, res: Response) => {
  try {
    const data = getPriceSchema.parse(req.body)
    const zones = await prisma.taxiZone.findMany()

    let pickupZone = null
    let dropoffZone = null
    for (const zone of zones) {
      if (!zone.boundaries) {
        continue // Skip zones with null boundaries
      }
      const boundaries = JSON.parse(zone.boundaries)
      if (isPointInPolygon(data.pickup, boundaries)) {
        pickupZone = zone
      }
      if (isPointInPolygon(data.dropoff, boundaries)) {
        dropoffZone = zone
      }
    }

    if (!pickupZone || !dropoffZone) {
      return res.status(400).json({ error: "Zone not found" })
    }

    const price = pickupZone.basePrice + (pickupZone.id === dropoffZone.id ? 0 : dropoffZone.basePrice * 0.5)
    res.json({ price, pickupZone, dropoffZone })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
