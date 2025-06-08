//reviews.ts
import { Router } from "express"
import { createUserReview, createDriverReview, getDriverReviews, getUserReviews } from "../controllers/reviewController"
import { driverOnly } from "../controllers/serviceController"
import { authMiddleware } from "../middlewares/authMiddleware"

const router = Router()

router.post("/service/:id",authMiddleware, createUserReview)
router.post("/user/:id", authMiddleware, driverOnly, createDriverReview)
router.get("/driver/:id", getDriverReviews)
router.get("/user/:id", getUserReviews)

export default router
