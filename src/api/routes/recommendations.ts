import { Router } from "express"
import {
  getPlaceCategories,
  getPlacesByCategory,
  getPlaceDetails,
  getRecommendedPlaces,
  startPlaceSurvey,
  submitPlaceVote,
  completeSurvey,
} from "../controllers/recommendationController"
import { requireAuth } from "@clerk/express"

const router = Router()

// Public routes
router.get("/categories", getPlaceCategories)
router.get("/places", getPlacesByCategory)
router.get("/places/:id", getPlaceDetails)

// Authenticated routes
router.get("/for-me", requireAuth(), getRecommendedPlaces)
router.post("/survey", requireAuth(), startPlaceSurvey)
router.post("/survey/:id/vote", requireAuth(), submitPlaceVote)
router.post("/survey/:id/complete", requireAuth(), completeSurvey)

export default router
