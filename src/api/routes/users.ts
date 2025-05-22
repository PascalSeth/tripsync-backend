import { Router, type Response } from "express"
import { asyncHandler } from "../middlewares/asyncHandler"
import { authMiddleware, type AuthRequest } from "../middlewares/authMiddleware"
import {
  getProfile,
  updateProfile,
  addFavoriteLocation,
  updateProfileSchema,
  favoriteLocationSchema,
} from "../controllers/userController"

const router = Router()

router.get(
  "/profile",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId // Assert req.user is defined
    const user = await getProfile(userId)
    res.json(user)
  }),
)

router.put(
  "/profile",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId // Assert req.user is defined
    const data = updateProfileSchema.parse(req.body)
    const user = await updateProfile(userId, data)
    res.json(user)
  }),
)

router.post(
  "/favorite-locations",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId // Assert req.user is defined
    const data = favoriteLocationSchema.parse(req.body)
    const favoriteLocation = await addFavoriteLocation(userId, data)
    res.status(201).json(favoriteLocation)
  }),
)

export default router
