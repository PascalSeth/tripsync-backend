//reviews.ts
import { Router } from "express"
import { createUserReview, createDriverReview, getDriverReviews, getUserReviews } from "../controllers/reviewController"
import { requireAuth } from "@clerk/express"
import { driverOnly } from "../controllers/serviceController"

const router = Router()

router.post("/service/:id", requireAuth(), createUserReview)
router.post("/user/:id", requireAuth(), driverOnly, createDriverReview)
router.get("/driver/:id", getDriverReviews)
router.get("/user/:id", getUserReviews)

export default router
