//recommendation.ts
import { Router } from "express"
import {
  createPlaceCategory,
  getPlaceCategories,
  getPlaceCategory,
  updatePlaceCategory,
  deletePlaceCategory,
  createPlace,
  getPlaces,
  getPlace,
  updatePlace,
  deletePlace,
  createRecommendationModel,
  getRecommendationModels,
  getRecommendationModel,
  updateRecommendationModel,
  deleteRecommendationModel,
} from "../controllers/placeController"
import { requireAuth } from "@clerk/express"
import { authMiddleware, superAdminOnly } from "../middlewares/authMiddleware"

const router = Router()

// Place Category Routes
router.post("/categories", authMiddleware,superAdminOnly, createPlaceCategory)
router.get("/categories", getPlaceCategories)
router.get("/categories/:id", getPlaceCategory)
router.put("/categories/:id", authMiddleware,superAdminOnly, updatePlaceCategory)
router.delete("/categories/:id", authMiddleware,superAdminOnly, deletePlaceCategory)

// Place Routes
router.post("/places", authMiddleware,superAdminOnly, createPlace)
router.get("/places",  getPlaces)
router.get("/places/:id",  getPlace)
router.put("/places/:id", authMiddleware,superAdminOnly, updatePlace)
router.delete("/places/:id", authMiddleware,superAdminOnly, deletePlace)

// Recommendation Model Routes
router.post("/models", authMiddleware,superAdminOnly, createRecommendationModel)
router.get("/models",  getRecommendationModels)
router.get("/models/:id",  getRecommendationModel)
router.put("/models/:id", authMiddleware,superAdminOnly, updateRecommendationModel)
router.delete("/models/:id", authMiddleware,superAdminOnly, deleteRecommendationModel)

export default router
