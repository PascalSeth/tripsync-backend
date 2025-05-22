//Store Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import { geocodingClient } from "../../config/mapbox"
import { getDistance } from "geolib"

// Schemas
export const createStoreSchema = z.object({
  name: z.string().min(3),
  type: z.enum(["GROCERY", "PHARMACY", "RESTAURANT", "RETAIL", "ELECTRONICS", "OTHER"]),
  address: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string().email(),
  operatingHours: z.string(), // JSON string with operating hours
  description: z.string().optional(),
})

export const updateStoreSchema = createStoreSchema.partial()

export const addProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().positive(),
  category: z.string(),
  image: z.string().optional(),
  inStock: z.boolean().default(true),
})

export const updateProductSchema = addProductSchema.partial()

// Create a new store
export const createStore = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = createStoreSchema.parse(req.body)

    // Geocode address
    const geoResponse = await geocodingClient.forwardGeocode({ query: data.address }).send()
    const feature = geoResponse.body.features[0]
    if (!feature) {
      return res.status(400).json({ error: "Invalid address" })
    }

    // Create location
    const location = await prisma.location.create({
      data: {
        latitude: feature.center[1],
        longitude: feature.center[0],
        address: feature.place_name,
        city: feature.context.find((c: any) => c.id.includes("place"))?.text || "",
        country: feature.context.find((c: any) => c.id.includes("country"))?.text || "",
        placeId: feature.id,
      },
    })

    // Create store
    const store = await prisma.store.create({
      data: {
        name: data.name,
        type: data.type,
        locationId: location.id,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        operatingHours: data.operatingHours,
        description: data.description,
      },
    })

    res.status(201).json({
      ...store,
      location,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Update a store
export const updateStore = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateStoreSchema.parse(req.body)

    // Check if store exists
    const store = await prisma.store.findUnique({
      where: { id },
      include: { location: true },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
    }

    // Update location if address changed
    if (data.address) {
      const geoResponse = await geocodingClient.forwardGeocode({ query: data.address }).send()
      const feature = geoResponse.body.features[0]
      if (!feature) {
        return res.status(400).json({ error: "Invalid address" })
      }

      await prisma.location.update({
        where: { id: store.locationId },
        data: {
          latitude: feature.center[1],
          longitude: feature.center[0],
          address: feature.place_name,
          city: feature.context.find((c: any) => c.id.includes("place"))?.text || "",
          country: feature.context.find((c: any) => c.id.includes("country"))?.text || "",
          placeId: feature.id,
        },
      })
    }

    // Update store
    const updatedStore = await prisma.store.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        operatingHours: data.operatingHours,
        description: data.description,
      },
      include: { location: true },
    })

    res.json(updatedStore)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get store details
export const getStoreDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        location: true,
        products: {
          where: { inStock: true },
        },
      },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
    }

    res.json(store)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// List stores
export const listStores = async (req: Request, res: Response) => {
  try {
    const { type, lat, lng, radius } = req.query

    const whereClause: any = {}

    // Filter by type
    if (type) {
      whereClause.type = type
    }

    // Get all stores
    const stores = await prisma.store.findMany({
      where: whereClause,
      include: {
        location: true,
      },
      orderBy: {
        name: "asc",
      },
    })

    // Filter by distance if coordinates provided
    if (lat && lng && radius) {
      const latitude = Number.parseFloat(lat as string)
      const longitude = Number.parseFloat(lng as string)
      const maxRadius = Number.parseFloat(radius as string) // in km

      // Calculate distance for each store
      const storesWithDistance = stores
        .map((store) => {
          const distance = getDistance(
            { latitude, longitude },
            { latitude: store.location.latitude, longitude: store.location.longitude },
          )
          return {
            ...store,
            distance: distance / 1000, // Convert to km
          }
        })
        .filter((store) => store.distance <= maxRadius)
        .sort((a, b) => a.distance - b.distance)

      return res.json(storesWithDistance)
    }

    res.json(stores)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Add a product to a store
export const addProduct = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params
    const data = addProductSchema.parse(req.body)

    // Check if store exists
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
    }

    // Create product
    const product = await prisma.product.create({
      data: {
        storeId,
        name: data.name,
        description: data.description,
        price: data.price,
        category: data.category,
        image: data.image,
        inStock: data.inStock,
      },
    })

    res.status(201).json(product)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Update a product
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { storeId, id } = req.params
    const data = updateProductSchema.parse(req.body)

    // Check if product exists and belongs to the store
    const product = await prisma.product.findFirst({
      where: {
        id,
        storeId,
      },
    })

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Update product
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        category: data.category,
        image: data.image,
        inStock: data.inStock,
      },
    })

    res.json(updatedProduct)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// List products for a store
export const listProducts = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params
    const { category, inStock } = req.query

    const whereClause: any = {
      storeId,
    }

    // Filter by category
    if (category) {
      whereClause.category = category
    }

    // Filter by stock status
    if (inStock !== undefined) {
      whereClause.inStock = inStock === "true"
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: {
        category: "asc",
      },
    })

    res.json(products)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get product details
export const getProductDetails = async (req: Request, res: Response) => {
  try {
    const { storeId, id } = req.params

    const product = await prisma.product.findFirst({
      where: {
        id,
        storeId,
      },
    })

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    res.json(product)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
