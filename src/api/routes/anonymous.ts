//anonymous.ts
import { Router } from "express"
import {
  createAnonymousUser,
  getAnonymousUserPreferences,
  startSurvey,
  submitPlaceVote,
  completeSurvey,
  getRecommendedPlaces,
} from "../controllers/anonymousController"

const router = Router()

// Anonymous user routes
router.post("/create", createAnonymousUser)
router.get("/:id/preferences", getAnonymousUserPreferences)
router.post("/:id/survey", startSurvey)
router.post("/:id/survey/:surveyId/vote", submitPlaceVote)
router.post("/:id/survey/:surveyId/complete", completeSurvey)
router.get("/:id/recommendations", getRecommendedPlaces)

export default router
