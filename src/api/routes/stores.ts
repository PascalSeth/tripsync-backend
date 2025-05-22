import { Router } from "express"
import {
  createStore,
  updateStore,
  getStoreDetails,
  listStores,
  addProduct,
  updateProduct,
  listProducts,
  getProductDetails,
} from "../controllers/storeController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Store management
router.post("/", requireAuth(), createStore)
router.put("/:id", requireAuth(), updateStore)
router.get("/:id", getStoreDetails)
router.get("/", listStores)

// Product management
router.post("/:storeId/products", requireAuth(), addProduct)
router.put("/:storeId/products/:id", requireAuth(), updateProduct)
router.get("/:storeId/products", listProducts)
router.get("/:storeId/products/:id", getProductDetails)

export default router
