//storeController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createStoreSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["GROCERY", "PHARMACY", "RESTAURANT", "RETAIL", "ELECTRONICS", "OTHER"]),
  locationId: z.string().uuid(),
  contactPhone: z.string().min(5),
  contactEmail: z.string().email().optional(),
  operatingHours: z.string(), // JSON string
  description: z.string().optional(),
  isActive: z.boolean().optional(),
})

export const updateStoreSchema = createStoreSchema.partial()

export const createProductSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().positive(),
  category: z.string(),
  image: z.string().optional(),
  inStock: z.boolean().optional(),
})

export const updateProductSchema = createProductSchema.partial().omit({ storeId: true })

// Store Management
export const createStore = async (req: Request, res: Response) => {
  try {
    const data = createStoreSchema.parse(req.body)

    // Check if location exists
    const location = await prisma.location.findUnique({
      where: { id: data.locationId },
    })

    if (!location) {
      return res.status(400).json({ error: "Location not found" })
    }

    const store = await prisma.store.create({
      data,
      include: {
        location: true,
      },
    })

    res.status(201).json(store)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getStores = async (req: Request, res: Response) => {
  try {
    const { type, isActive } = req.query

    const whereClause: any = {}

    if (type) {
      whereClause.type = type
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    const stores = await prisma.store.findMany({
      where: whereClause,
      include: {
        location: true,
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
      orderBy: { name: "asc" },
    })

    res.json(stores)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getStore = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        location: true,
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
    }

    // Get recent orders
    const recentOrders = await prisma.service.findMany({
      where: {
        storeId: id,
        serviceType: {
          category: "STORE_DELIVERY",
        },
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
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
        orderItems: {
          include: {
            product: true,
          },
        },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    res.json({
      ...store,
      recentOrders,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateStore = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateStoreSchema.parse(req.body)

    // Check if store exists
    const store = await prisma.store.findUnique({
      where: { id },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
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

    const updatedStore = await prisma.store.update({
      where: { id },
      data,
      include: {
        location: true,
      },
    })

    res.json(updatedStore)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteStore = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if store has orders
    const ordersCount = await prisma.service.count({
      where: { storeId: id },
    })

    if (ordersCount > 0) {
      return res.status(400).json({
        error: "Cannot delete store that has orders",
        ordersCount,
      })
    }

    // Check if store has products
    const productsCount = await prisma.product.count({
      where: { storeId: id },
    })

    if (productsCount > 0) {
      // Delete all products first
      await prisma.product.deleteMany({
        where: { storeId: id },
      })
    }

    await prisma.store.delete({
      where: { id },
    })

    res.json({ message: "Store deleted successfully", productsDeleted: productsCount })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Product Management
export const createProduct = async (req: Request, res: Response) => {
  try {
    const data = createProductSchema.parse(req.body)

    // Check if store exists
    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
    })

    if (!store) {
      return res.status(400).json({ error: "Store not found" })
    }

    const product = await prisma.product.create({
      data,
      include: {
        store: true,
      },
    })

    res.status(201).json(product)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { storeId, category, inStock } = req.query

    const whereClause: any = {}

    if (storeId) {
      whereClause.storeId = storeId
    }

    if (category) {
      whereClause.category = category
    }

    if (inStock !== undefined) {
      whereClause.inStock = inStock === "true"
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    })

    res.json(products)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getProductCategories = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.query

    const whereClause: any = {}

    if (storeId) {
      whereClause.storeId = storeId
    }

    const categories = await prisma.product.groupBy({
      by: ["category"],
      where: whereClause,
      _count: {
        _all: true,
      },
      orderBy: {
        category: "asc",
      },
    })

    res.json(categories)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        store: true,
      },
    })

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Get order count
    const orderItemsCount = await prisma.orderItem.count({
      where: { productId: id },
    })

    res.json({
      ...product,
      _count: {
        orderItems: orderItemsCount,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateProductSchema.parse(req.body)

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id },
    })

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data,
      include: {
        store: true,
      },
    })

    res.json(updatedProduct)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if product has order items
    const orderItemsCount = await prisma.orderItem.count({
      where: { productId: id },
    })

    if (orderItemsCount > 0) {
      return res.status(400).json({
        error: "Cannot delete product that has order items",
        orderItemsCount,
      })
    }

    await prisma.product.delete({
      where: { id },
    })

    res.json({ message: "Product deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
