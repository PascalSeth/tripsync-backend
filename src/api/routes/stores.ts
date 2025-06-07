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
} from "../controllers/storeController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Store Routes
router.post("/", requireAuth(), createStore)
router.get("/", requireAuth(), getStores)
router.get("/:id", requireAuth(), getStore)
router.put("/:id", requireAuth(), updateStore)
router.delete("/:id", requireAuth(), deleteStore)

// Product Routes
router.post("/products", requireAuth(), createProduct)
router.get("/products", requireAuth(), getProducts)
router.get("/product-categories", requireAuth(), getProductCategories)
router.get("/products/:id", requireAuth(), getProduct)
router.put("/products/:id", requireAuth(), updateProduct)
router.delete("/products/:id", requireAuth(), deleteProduct)

export default router
