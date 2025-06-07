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

const router = Router()

// Place Category Routes
router.post("/categories", requireAuth(), createPlaceCategory)
router.get("/categories", requireAuth(), getPlaceCategories)
router.get("/categories/:id", requireAuth(), getPlaceCategory)
router.put("/categories/:id", requireAuth(), updatePlaceCategory)
router.delete("/categories/:id", requireAuth(), deletePlaceCategory)

// Place Routes
router.post("/places", requireAuth(), createPlace)
router.get("/places", requireAuth(), getPlaces)
router.get("/places/:id", requireAuth(), getPlace)
router.put("/places/:id", requireAuth(), updatePlace)
router.delete("/places/:id", requireAuth(), deletePlace)

// Recommendation Model Routes
router.post("/models", requireAuth(), createRecommendationModel)
router.get("/models", requireAuth(), getRecommendationModels)
router.get("/models/:id", requireAuth(), getRecommendationModel)
router.put("/models/:id", requireAuth(), updateRecommendationModel)
router.delete("/models/:id", requireAuth(), deleteRecommendationModel)

export default router
