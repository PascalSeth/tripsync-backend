//stores.ts
import { Router } from "express"
import {
  createStore,
  getStores,
  getStore,
  updateStore,
  deleteStore,
  createProduct,
  getProducts,
  getProductCategories,
  getProduct,
  updateProduct,
  deleteProduct,
  createStaff,
  getStaff,
  updateStaff,
  deleteStaff,
  setBusinessHours,
  bulkUpdateProducts,
  toggleStoreClosure,
} from "../controllers/storeController"
import { authMiddleware, requirePermission, storeOwnerOnly } from "../middlewares/authMiddleware"
import { auditMiddleware } from "../controllers/auditController"

const router = Router()

// Store Routes
router.post("/", authMiddleware, requirePermission("CREATE_STORE"), auditMiddleware("CREATE", "store"), createStore)
router.get("/", authMiddleware, getStores)
router.get("/:id", authMiddleware, getStore)
router.put("/:id", authMiddleware, requirePermission("UPDATE_STORE"), auditMiddleware("UPDATE", "store"), updateStore)
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("DELETE_STORE"),
  auditMiddleware("DELETE", "store"),
  deleteStore,
)

// Store closure management
router.put("/:id/closure", authMiddleware, storeOwnerOnly, toggleStoreClosure)

// Staff Routes
router.post("/staff", authMiddleware, storeOwnerOnly, createStaff)
router.get("/staff", authMiddleware, storeOwnerOnly, getStaff)
router.put("/staff/:id", authMiddleware, storeOwnerOnly, updateStaff)
router.delete("/staff/:id", authMiddleware, storeOwnerOnly, deleteStaff)

// Business Hours Routes
router.post("/business-hours", authMiddleware, storeOwnerOnly, setBusinessHours)

// Product Routes
router.post(
  "/products",
  authMiddleware,
  requirePermission("MANAGE_STORE_PRODUCTS"),
  auditMiddleware("CREATE", "product"),
  createProduct,
)
router.get("/products", authMiddleware, getProducts)
router.get("/product-categories", authMiddleware, getProductCategories)
router.get("/products/:id", authMiddleware, getProduct)
router.put(
  "/products/:id",
  authMiddleware,
  requirePermission("MANAGE_STORE_PRODUCTS"),
  auditMiddleware("UPDATE", "product"),
  updateProduct,
)
router.delete(
  "/products/:id",
  authMiddleware,
  requirePermission("MANAGE_STORE_PRODUCTS"),
  auditMiddleware("DELETE", "product"),
  deleteProduct,
)

// Bulk operations
router.put("/products/bulk", authMiddleware, storeOwnerOnly, bulkUpdateProducts)

export default router
