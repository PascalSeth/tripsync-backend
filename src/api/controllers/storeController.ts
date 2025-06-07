//storeController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Response } from "express"
import type { AuthRequest } from "../middlewares/authMiddleware"
import { createAuditLog } from "./auditController"

// Enhanced schemas
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
  stockQuantity: z.number().int().min(0).optional(),
  minStockLevel: z.number().int().min(0).optional(),
  sku: z.string().optional(),
})

export const updateProductSchema = createProductSchema.partial().omit({ storeId: true })

export const createStaffSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(2),
  role: z.enum(["MANAGER", "CASHIER", "INVENTORY", "DELIVERY"]),
  phone: z.string().min(5),
  email: z.string().email().optional(),
})

export const updateStaffSchema = createStaffSchema.partial().omit({ storeId: true })

export const createBusinessHoursSchema = z.object({
  storeId: z.string().uuid(),
  schedule: z.array(
    z.object({
      dayOfWeek: z.number().min(0).max(6),
      openTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      closeTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      isClosed: z.boolean().optional(),
    }),
  ),
})

// Store Management
export const createStore = async (req: AuthRequest, res: Response) => {
  try {
    const data = createStoreSchema.parse(req.body)
    const userId = req.user?.userId!

    // Check if location exists
    const location = await prisma.location.findUnique({
      where: { id: data.locationId },
    })

    if (!location) {
      return res.status(400).json({ error: "Location not found" })
    }

    // Get or create store owner profile
    let storeOwner = await prisma.storeOwnerProfile.findUnique({
      where: { userId },
    })

    if (!storeOwner) {
      // Create store owner profile if user is being promoted
      storeOwner = await prisma.storeOwnerProfile.create({
        data: {
          userId,
          businessLicense: "PENDING",
          businessType: "RETAIL",
        },
      })

      // Update user role if needed
      await prisma.user.update({
        where: { id: userId },
        data: { role: "STORE_OWNER" },
      })
    }

    const store = await prisma.store.create({
      data: {
        ...data,
        ownerId: storeOwner.id,
      },
      include: {
        location: true,
        owner: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    })

    // Create audit log
    await createAuditLog(userId, "CREATE", "store", store.id, null, store, req)

    res.status(201).json(store)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getStores = async (req: AuthRequest, res: Response) => {
  try {
    const { type, isActive, ownerId } = req.query
    const userId = req.user?.userId
    const userRole = req.user?.role

    const whereClause: any = {}

    if (type) {
      whereClause.type = type
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    // Store owners can only see their own stores unless they're admin
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (storeOwner) {
        whereClause.ownerId = storeOwner.id
      }
    } else if (ownerId && (userRole === "SUPER_ADMIN" || userRole === "CITY_ADMIN")) {
      whereClause.ownerId = ownerId
    }

    const stores = await prisma.store.findMany({
      where: whereClause,
      include: {
        location: true,
        owner: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            products: true,
            orders: true,
            staff: true,
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

export const getStore = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const userId = req.user?.userId
    const userRole = req.user?.role

    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        location: true,
        owner: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        staff: true,
        businessHours: {
          orderBy: { dayOfWeek: "asc" },
        },
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

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
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

export const updateStore = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const data = updateStoreSchema.parse(req.body)
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if store exists and user has access
    const store = await prisma.store.findUnique({
      where: { id },
      include: { owner: true },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
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

    const oldValues = { ...store }
    const updatedStore = await prisma.store.update({
      where: { id },
      data,
      include: {
        location: true,
        owner: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    })

    // Create audit log
    await createAuditLog(userId, "UPDATE", "store", id, oldValues, updatedStore, req)

    res.json(updatedStore)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteStore = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if store exists and user has access
    const store = await prisma.store.findUnique({
      where: { id },
      include: { owner: true },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
    }

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

    // Delete staff
    await prisma.storeStaff.deleteMany({
      where: { storeId: id },
    })

    // Delete business hours
    await prisma.businessHours.deleteMany({
      where: { storeId: id },
    })

    const oldValues = { ...store }
    await prisma.store.delete({
      where: { id },
    })

    // Create audit log
    await createAuditLog(userId, "DELETE", "store", id, oldValues, null, req)

    res.json({ message: "Store deleted successfully", productsDeleted: productsCount })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Staff Management
export const createStaff = async (req: AuthRequest, res: Response) => {
  try {
    const data = createStaffSchema.parse(req.body)
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if store exists and user has access
    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
      include: { owner: true },
    })

    if (!store) {
      return res.status(400).json({ error: "Store not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
    }

    const staff = await prisma.storeStaff.create({
      data,
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Create audit log
    await createAuditLog(userId, "CREATE", "store_staff", staff.id, null, staff, req)

    res.status(201).json(staff)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.query
    const userId = req.user?.userId
    const userRole = req.user?.role

    const whereClause: any = {}

    if (storeId) {
      whereClause.storeId = storeId

      // Check access permissions for specific store
      if (userRole === "STORE_OWNER") {
        const store = await prisma.store.findUnique({
          where: { id: storeId as string },
          include: { owner: true },
        })

        if (store) {
          const storeOwner = await prisma.storeOwnerProfile.findUnique({
            where: { userId },
          })
          if (!storeOwner || store.ownerId !== storeOwner.id) {
            return res.status(403).json({ error: "Access denied" })
          }
        }
      }
    } else if (userRole === "STORE_OWNER") {
      // Show only staff from stores owned by this user
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
        include: { stores: { select: { id: true } } },
      })
      if (storeOwner) {
        whereClause.storeId = { in: storeOwner.stores.map((s) => s.id) }
      }
    }

    const staff = await prisma.storeStaff.findMany({
      where: whereClause,
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ store: { name: "asc" } }, { name: "asc" }],
    })

    res.json(staff)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const data = updateStaffSchema.parse(req.body)
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if staff exists and user has access
    const staff = await prisma.storeStaff.findUnique({
      where: { id },
      include: {
        store: {
          include: { owner: true },
        },
      },
    })

    if (!staff) {
      return res.status(404).json({ error: "Staff member not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || staff.store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
    }

    const oldValues = { ...staff }
    const updatedStaff = await prisma.storeStaff.update({
      where: { id },
      data,
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Create audit log
    await createAuditLog(userId, "UPDATE", "store_staff", id, oldValues, updatedStaff, req)

    res.json(updatedStaff)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if staff exists and user has access
    const staff = await prisma.storeStaff.findUnique({
      where: { id },
      include: {
        store: {
          include: { owner: true },
        },
      },
    })

    if (!staff) {
      return res.status(404).json({ error: "Staff member not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || staff.store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
    }

    const oldValues = { ...staff }
    await prisma.storeStaff.delete({
      where: { id },
    })

    // Create audit log
    await createAuditLog(userId, "DELETE", "store_staff", id, oldValues, null, req)

    res.json({ message: "Staff member deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Business Hours Management
export const setBusinessHours = async (req: AuthRequest, res: Response) => {
  try {
    const data = createBusinessHoursSchema.parse(req.body)
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if store exists and user has access
    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
      include: { owner: true },
    })

    if (!store) {
      return res.status(400).json({ error: "Store not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
    }

    // Delete existing business hours
    await prisma.businessHours.deleteMany({
      where: { storeId: data.storeId },
    })

    // Create new business hours
    const businessHours = await prisma.businessHours.createMany({
      data: data.schedule.map((schedule) => ({
        storeId: data.storeId,
        ...schedule,
      })),
    })

    // Get created business hours
    const createdHours = await prisma.businessHours.findMany({
      where: { storeId: data.storeId },
      orderBy: { dayOfWeek: "asc" },
    })

    // Create audit log
    await createAuditLog(userId, "UPDATE", "business_hours", data.storeId, null, createdHours, req)

    res.json({
      message: "Business hours updated successfully",
      businessHours: createdHours,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Product Management (Enhanced)
export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const data = createProductSchema.parse(req.body)
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if store exists and user has access
    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
      include: { owner: true },
    })

    if (!store) {
      return res.status(400).json({ error: "Store not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
    }

    const product = await prisma.product.create({
      data,
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Create audit log
    await createAuditLog(userId, "CREATE", "product", product.id, null, product, req)

    res.status(201).json(product)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { storeId, category, inStock, lowStock } = req.query
    const userId = req.user?.userId
    const userRole = req.user?.role

    const whereClause: any = {}

    if (storeId) {
      whereClause.storeId = storeId

      // Check access permissions for specific store
      if (userRole === "STORE_OWNER") {
        const store = await prisma.store.findUnique({
          where: { id: storeId as string },
          include: { owner: true },
        })

        if (store) {
          const storeOwner = await prisma.storeOwnerProfile.findUnique({
            where: { userId },
          })
          if (!storeOwner || store.ownerId !== storeOwner.id) {
            return res.status(403).json({ error: "Access denied" })
          }
        }
      }
    } else if (userRole === "STORE_OWNER") {
      // Show only products from stores owned by this user
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
        include: { stores: { select: { id: true } } },
      })
      if (storeOwner) {
        whereClause.storeId = { in: storeOwner.stores.map((s) => s.id) }
      }
    }

    if (category) {
      whereClause.category = category
    }

    if (inStock !== undefined) {
      whereClause.inStock = inStock === "true"
    }

    if (lowStock === "true") {
      whereClause.stockQuantity = { lte: prisma.product.fields.minStockLevel }
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

export const getProductCategories = async (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.query
    const userId = req.user?.userId
    const userRole = req.user?.role

    const whereClause: any = {}

    if (storeId) {
      whereClause.storeId = storeId

      // Check access permissions for specific store
      if (userRole === "STORE_OWNER") {
        const store = await prisma.store.findUnique({
          where: { id: storeId as string },
          include: { owner: true },
        })

        if (store) {
          const storeOwner = await prisma.storeOwnerProfile.findUnique({
            where: { userId },
          })
          if (!storeOwner || store.ownerId !== storeOwner.id) {
            return res.status(403).json({ error: "Access denied" })
          }
        }
      }
    } else if (userRole === "STORE_OWNER") {
      // Show only categories from stores owned by this user
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
        include: { stores: { select: { id: true } } },
      })
      if (storeOwner) {
        whereClause.storeId = { in: storeOwner.stores.map((s) => s.id) }
      }
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

export const getProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const userId = req.user?.userId
    const userRole = req.user?.role

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        store: {
          include: { owner: true },
        },
      },
    })

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || product.store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
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

export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const data = updateProductSchema.parse(req.body)
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if product exists and user has access
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        store: {
          include: { owner: true },
        },
      },
    })

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || product.store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
    }

    const oldValues = { ...product }
    const updatedProduct = await prisma.product.update({
      where: { id },
      data,
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Create audit log
    await createAuditLog(userId, "UPDATE", "product", id, oldValues, updatedProduct, req)

    res.json(updatedProduct)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if product exists and user has access
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        store: {
          include: { owner: true },
        },
      },
    })

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || product.store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
    }

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

    const oldValues = { ...product }
    await prisma.product.delete({
      where: { id },
    })

    // Create audit log
    await createAuditLog(userId, "DELETE", "product", id, oldValues, null, req)

    res.json({ message: "Product deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const bulkUpdateProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { productIds, updates } = req.body
    const userId = req.user?.userId
    const userRole = req.user?.role

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: "Product IDs array is required" })
    }

    // Check if user has access to all products
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
        include: { stores: { select: { id: true } } },
      })

      if (storeOwner) {
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, storeId: true },
        })

        const storeIds = storeOwner.stores.map((s) => s.id)
        const unauthorizedProducts = products.filter((p) => !storeIds.includes(p.storeId))

        if (unauthorizedProducts.length > 0) {
          return res.status(403).json({ error: "Access denied to some products" })
        }
      }
    }

    const result = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: updates,
    })

    // Create audit log
    await createAuditLog(
      userId,
      "BULK_UPDATE",
      "product",
      undefined, // Changed from null to undefined
      null,
      { productIds, updates, count: result.count },
      req,
    )

    res.json({
      message: "Products updated successfully",
      updatedCount: result.count,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
// Store closure management
export const toggleStoreClosure = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { isTemporarilyClosed, closureReason } = req.body
    const userId = req.user?.userId
    const userRole = req.user?.role

    // Check if store exists and user has access
    const store = await prisma.store.findUnique({
      where: { id },
      include: { owner: true },
    })

    if (!store) {
      return res.status(404).json({ error: "Store not found" })
    }

    // Check access permissions
    if (userRole === "STORE_OWNER") {
      const storeOwner = await prisma.storeOwnerProfile.findUnique({
        where: { userId },
      })
      if (!storeOwner || store.ownerId !== storeOwner.id) {
        return res.status(403).json({ error: "Access denied" })
      }
    }

    const oldValues = { isTemporarilyClosed: store.isTemporarilyClosed, closureReason: store.closureReason }
    const updatedStore = await prisma.store.update({
      where: { id },
      data: {
        isTemporarilyClosed,
        closureReason: isTemporarilyClosed ? closureReason ?? undefined : undefined, // Convert null to undefined
      },
    })

    // Create audit log
    await createAuditLog(userId, "UPDATE", "store_closure", id, oldValues, { isTemporarilyClosed, closureReason }, req)

    res.json({
      message: isTemporarilyClosed ? "Store temporarily closed" : "Store reopened",
      store: updatedStore,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}