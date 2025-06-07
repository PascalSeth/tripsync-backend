//locationMapboxController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import { geocodeAddress, reverseGeocode, calculateRoute, calculateDistance, isPointInPolygon } from "../../config/mapbox"

// Schemas
export const createLocationSchema = z.object({
  address: z.string().min(3),
  name: z.string().optional(),
  type: z.enum(["HOME", "WORK", "FAVORITE", "OTHER"]).optional(),
  userId: z.string().uuid().optional(),
  country: z.string().optional(), // Add country as optional
});

export const updateLocationSchema = createLocationSchema.partial()

export const geocodeLocationSchema = z.object({
  address: z.string().min(3),
})

export const reverseGeocodeSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
})

export const calculateRouteSchema = z.object({
  startLocationId: z.string().uuid(),
  endLocationId: z.string().uuid(),
  profile: z.enum(["driving", "walking", "cycling"]).optional(),
})

export const createLocation = async (req: Request, res: Response) => {
  try {
    const data = createLocationSchema.parse(req.body);

    // Geocode the address
    const geocodeResult = await geocodeAddress(data.address);

    if (!geocodeResult) {
      return res.status(400).json({ error: "Could not geocode address" });
    }

    const [longitude, latitude] = geocodeResult.coordinates;

    // Extract country from context
    const countryFeature = geocodeResult.context.find((f: any) => f.id.startsWith("country"));
    const country = data.country || countryFeature?.text || countryFeature?.short_code || "Unknown";

    // Extract placeId from the feature's id (assuming geocodeResult is based on the first feature)
    const placeId = geocodeResult.id || undefined;

    // Create location
    const location = await prisma.location.create({
      data: {
        address: data.address,
        city: data.name || geocodeResult.placeName,
        country,
        longitude,
        latitude,
        placeId,
      },
    });

    res.status(201).json({
      ...location,
      geocodeResult,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const geocodeLocation = async (req: Request, res: Response) => {
  try {
    const { address } = geocodeLocationSchema.parse(req.body)

    const geocodeResult = await geocodeAddress(address)

    if (!geocodeResult) {
      return res.status(400).json({ error: "Could not geocode address" })
    }

    res.json(geocodeResult)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const reverseGeocodeLocation = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude } = reverseGeocodeSchema.parse(req.body)

    const geocodeResult = await reverseGeocode(longitude, latitude)

    if (!geocodeResult) {
      return res.status(400).json({ error: "Could not reverse geocode coordinates" })
    }

    res.json(geocodeResult)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getRouteDetails = async (req: Request, res: Response) => {
  try {
    const { startLocationId, endLocationId, profile } = calculateRouteSchema.parse(req.body)

    // Get locations
    const [startLocation, endLocation] = await Promise.all([
      prisma.location.findUnique({
        where: { id: startLocationId },
      }),
      prisma.location.findUnique({
        where: { id: endLocationId },
      }),
    ])

    if (!startLocation || !endLocation) {
      return res.status(404).json({ error: "One or both locations not found" })
    }

    // Calculate route
    const route = await calculateRoute(
      startLocation.longitude,
      startLocation.latitude,
      endLocation.longitude,
      endLocation.latitude,
      profile || "driving",
    )

    if (!route) {
      return res.status(400).json({ error: "Could not calculate route" })
    }

    // Calculate direct distance
    const directDistance = calculateDistance(
      startLocation.longitude,
      startLocation.latitude,
      endLocation.longitude,
      endLocation.latitude,
    )

    res.json({
      startLocation,
      endLocation,
      route: {
        ...route,
        distance: route.distance,
        distanceKm: Math.round(route.distance / 10) / 100, // Convert to km with 2 decimal places
        duration: route.duration,
        durationMinutes: Math.round(route.duration / 60),
      },
      directDistance,
      directDistanceKm: Math.round(directDistance / 10) / 100,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const findNearbyLocations = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude, radius, type } = req.query

    if (!longitude || !latitude) {
      return res.status(400).json({ error: "Longitude and latitude are required" })
    }

    const lng = Number.parseFloat(longitude as string)
    const lat = Number.parseFloat(latitude as string)
    const radiusMeters = Number.parseFloat(radius as string) || 1000 // Default 1km

    // This is a simplified approach - in production, you would use PostGIS or a similar
    // geospatial database extension for efficient spatial queries
    const whereClause: any = {}

    if (type) {
      whereClause.type = {
        equals: type as string,
      }
    }

    const locations = await prisma.location.findMany({
      where: {
        ...whereClause,
      },
    })

    // Filter locations by distance
    const nearbyLocations = locations.filter((location) => {
      const distance = calculateDistance(lng, lat, location.longitude, location.latitude)
      return distance <= radiusMeters
    })

    // Add distance to each location
    const locationsWithDistance = nearbyLocations.map((location) => {
      const distance = calculateDistance(lng, lat, location.longitude, location.latitude)
      return {
        ...location,
        distance,
        distanceKm: Math.round(distance / 10) / 100,
      }
    })

    // Sort by distance
    locationsWithDistance.sort((a, b) => a.distance - b.distance)

    res.json(locationsWithDistance)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const checkLocationInZone = async (req: Request, res: Response) => {
  try {
    const { locationId, zoneId } = req.params

    // Get location
    const location = await prisma.location.findUnique({
      where: { id: locationId },
    })

    if (!location) {
      return res.status(404).json({ error: "Location not found" })
    }

    // Get zone
    const zone = await prisma.taxiZone.findUnique({
      where: { id: zoneId },
    })

    if (!zone) {
      return res.status(404).json({ error: "Zone not found" })
    }

    // Check if zone has boundaries
    if (!zone.boundaries) {
      return res.status(400).json({ error: "Zone does not have defined boundaries" })
    }

    // Parse boundaries
    const boundaries = JSON.parse(zone.boundaries) as [number, number][][]

    // Check if location is in zone
    const isInZone = isPointInPolygon([location.longitude, location.latitude], boundaries)

    res.json({
      location,
      zone: {
        id: zone.id,
        name: zone.name,
      },
      isInZone,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
