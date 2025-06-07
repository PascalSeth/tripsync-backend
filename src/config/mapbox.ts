//mapbox.ts
import mapbox from "@mapbox/mapbox-sdk"
import mbxGeocoding from "@mapbox/mapbox-sdk/services/geocoding"
import mbxDirections from "@mapbox/mapbox-sdk/services/directions"
import { env } from "../config/env"

const mapboxClient = mapbox({ accessToken: env.MAPBOX_ACCESS_TOKEN })
export const geocodingClient = mbxGeocoding(mapboxClient)
export const directionsClient = mbxDirections(mapboxClient)
// Define types for clarity
interface GeocodeFeature {
  id: string;
  text: string;
  short_code?: string;
}

interface GeocodeProperties {
  [key: string]: any; // Flexible to accommodate Mapbox properties
}

interface GeocodeResult {
  id: string;
  coordinates: number[];
  placeName: string;
  context: GeocodeFeature[];
  properties: GeocodeProperties;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const response = await geocodingClient
      .forwardGeocode({
        query: address,
        limit: 1,
      })
      .send();

    if (response.body.features.length === 0) {
      return null;
    }

    const feature = response.body.features[0];
    return {
      id: feature.id, // Include the feature ID
      coordinates: feature.geometry.coordinates,
      placeName: feature.place_name,
      context: feature.context,
      properties: feature.properties,
    };
  } catch (error) {
    console.error("Geocoding error:", error);
    throw new Error("Failed to geocode address");
  }
}

/**
 * Reverse geocode coordinates to address
 */
export async function reverseGeocode(longitude: number, latitude: number) {
  try {
    const response = await geocodingClient
      .reverseGeocode({
        query: [longitude, latitude],
        limit: 1,
      })
      .send()

    if (response.body.features.length === 0) {
      return null
    }

    const feature = response.body.features[0]
    return {
      placeName: feature.place_name,
      context: feature.context,
      properties: feature.properties,
    }
  } catch (error) {
    console.error("Reverse geocoding error:", error)
    throw new Error("Failed to reverse geocode coordinates")
  }
}

/**
 * Calculate route between two points
 */
export async function calculateRoute(
  startLng: number,
  startLat: number,
  endLng: number,
  endLat: number,
  profile: "driving" | "walking" | "cycling" = "driving",
) {
  try {
    const response = await directionsClient
      .getDirections({
        profile,
        waypoints: [{ coordinates: [startLng, startLat] }, { coordinates: [endLng, endLat] }],
        geometries: "geojson",
        overview: "full",
        annotations: ["distance", "duration"],
      })
      .send()

    if (response.body.routes.length === 0) {
      return null
    }

    const route = response.body.routes[0]
    return {
      distance: route.distance, // in meters
      duration: route.duration, // in seconds
      geometry: route.geometry,
    }
  } catch (error) {
    console.error("Directions error:", error)
    throw new Error("Failed to calculate route")
  }
}

/**
 * Calculate distance between two points (as the crow flies)
 */
export function calculateDistance(startLng: number, startLat: number, endLng: number, endLat: number) {
  // Haversine formula to calculate distance between two points
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (startLat * Math.PI) / 180
  const φ2 = (endLat * Math.PI) / 180
  const Δφ = ((endLat - startLat) * Math.PI) / 180
  const Δλ = ((endLng - startLng) * Math.PI) / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c // in meters

  return distance
}

/**
 * Check if a point is within a polygon
 */
export function isPointInPolygon(point: [number, number], polygon: [number, number][][]) {
  // Ray casting algorithm to determine if point is in polygon
  let inside = false
  const x = point[0]
  const y = point[1]

  for (let i = 0, j = polygon[0].length - 1; i < polygon[0].length; j = i++) {
    const xi = polygon[0][i][0]
    const yi = polygon[0][i][1]
    const xj = polygon[0][j][0]
    const yj = polygon[0][j][1]

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }

  return inside
}
