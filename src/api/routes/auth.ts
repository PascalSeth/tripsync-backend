//auth.ts
import { Router } from "express"
import type { Response } from "express"
import { asyncHandler } from "../middlewares/asyncHandler"
import type { AuthRequest } from "../middlewares/authMiddleware"
import {
  register,
  registerDriver,
  login,
  registerSchema,
  driverRegisterSchema,
  loginSchema,
} from "../controllers/authController"

const router = Router()

router.post(
  "/register",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = registerSchema.parse(req.body)
    const result = await register(data)
    res.status(201).json(result)
  }),
)

router.post(
  "/driver/register",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = driverRegisterSchema.parse(req.body)
    const result = await registerDriver(data)
    res.status(201).json(result)
  }),
)

router.post(
  "/login",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = loginSchema.parse(req.body)
    const result = await login(data)
    res.json(result)
  }),
)

export default router
