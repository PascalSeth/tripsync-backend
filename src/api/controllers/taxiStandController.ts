//Taxi Stand Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import { getDistance } from "geolib"

export const createTaxiStandSchema = z.object({
  name: z.string(),
  location: z.object({ latitude: z.number(), longitude: z.number(), address: z.string() }),
  capacity: z.number().positive(),
})

export const getNearbyStandsSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
})

export const createTaxiStand = async (req: Request, res: Response) => {
  try {
    const data = createTaxiStandSchema.parse(req.body)
    const location = await prisma.location.create({
      data: {
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        address: data.location.address,
        city: "",
        country: "",
      },
    })

    const stand = await prisma.taxiStand.create({
      data: {
        name: data.name,
        locationId: location.id,
        capacity: data.capacity,
      },
    })
    res.status(201).json(stand)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getTaxiStands = async (req: Request, res: Response) => {
  const stands = await prisma.taxiStand.findMany({ include: { location: true } })
  res.json(stands)
}

export const getNearbyStands = async (req: Request, res: Response) => {
  try {
    const data = getNearbyStandsSchema.parse(req.body)
    const stands = await prisma.taxiStand.findMany({ include: { location: true } })

    const nearby = stands
      .map((stand) => ({
        ...stand,
        distance: getDistance(
          { latitude: data.latitude, longitude: data.longitude },
          { latitude: stand.location.latitude, longitude: stand.location.longitude },
        ),
      }))
      .filter((stand) => stand.distance < 5000) // Within 5km
      .sort((a, b) => a.distance - b.distance)

    res.json(nearby)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
