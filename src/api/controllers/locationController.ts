//Location Controller
import { prisma } from "../../config/prisma"
import { geocodingClient } from "../../config/mapbox"
import { z } from "zod"
import type { Request, Response } from "express"

export const createLocationSchema = z.object({
  address: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

export const geocodeSchema = z.object({
  address: z.string(),
})

export const createLocation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = createLocationSchema.parse(req.body)

    let latitude = data.latitude
    let longitude = data.longitude
    let address = data.address
    let city = ""
    let country = ""
    let placeId = ""

    if (!latitude || !longitude) {
      const geoResponse = await geocodingClient.forwardGeocode({ query: data.address }).send()
      const feature = geoResponse.body.features[0]
      if (!feature) {
        return res.status(400).json({ error: "Invalid address" })
      }
      latitude = feature.center[1]
      longitude = feature.center[0]
      address = feature.place_name
      city = feature.context.find((c: any) => c.id.includes("place"))?.text || ""
      country = feature.context.find((c: any) => c.id.includes("country"))?.text || ""
      placeId = feature.id
    }

    const location = await prisma.location.create({
      data: {
        latitude: latitude!,
        longitude: longitude!,
        address,
        city,
        country,
        placeId,
      },
    })

    await prisma.user.update({
      where: { id: userId },
      data: { favoriteLocations: { connect: { id: location.id } } },
    })

    res.status(201).json(location)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getLocations = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const locations = await prisma.location.findMany({
      where: { favoriteLocations: { some: { id: userId } } },
    })
    res.json(locations)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getGeocode = async (req: Request, res: Response) => {
  try {
    const data = geocodeSchema.parse(req.body)
    const geoResponse = await geocodingClient.forwardGeocode({ query: data.address }).send()
    const feature = geoResponse.body.features[0]
    if (!feature) {
      return res.status(400).json({ error: "Invalid address" })
    }
    res.json({
      latitude: feature.center[1],
      longitude: feature.center[0],
      address: feature.place_name,
      city: feature.context.find((c: any) => c.id.includes("place"))?.text || "",
      country: feature.context.find((c: any) => c.id.includes("country"))?.text || "",
      placeId: feature.id,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
