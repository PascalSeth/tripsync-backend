//auth.ts
import { Router } from "express"
import type { Response } from "express"
import { asyncHandler } from "../middlewares/asyncHandler"
import type { AuthRequest } from "../middlewares/authMiddleware"
import {
  register,
  registerDriver,
  registerStoreOwner,
  registerPlaceOwner,
  registerEmergencyResponder,
  login,
  logout,
  setupTwoFactor,
  verifyTwoFactor,
  registerSchema,
  driverRegisterSchema,
  storeOwnerRegisterSchema,
  placeOwnerRegisterSchema,
  emergencyResponderRegisterSchema,
  loginSchema,
  twoFactorSchema,
} from "../controllers/authController"
import { authMiddleware } from "../middlewares/authMiddleware"

const router = Router()

// Registration routes
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
  "/store-owner/register",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = storeOwnerRegisterSchema.parse(req.body)
    const result = await registerStoreOwner(data)
    res.status(201).json(result)
  }),
)

router.post(
  "/place-owner/register",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = placeOwnerRegisterSchema.parse(req.body)
    const result = await registerPlaceOwner(data)
    res.status(201).json(result)
  }),
)

router.post(
  "/emergency-responder/register",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = emergencyResponderRegisterSchema.parse(req.body)
    const result = await registerEmergencyResponder(data)
    res.status(201).json(result)
  }),
)

// Login/Logout routes
router.post(
  "/login",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = loginSchema.parse(req.body)
    const result = await login(data)
    res.json(result)
  }),
)

router.post(
  "/logout",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1]
    if (token) {
      const result = await logout(token)
      res.json(result)
    } else {
      res.status(400).json({ error: "No token provided" })
    }
  }),
)

// Two-factor authentication routes
router.post(
  "/2fa/setup",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId!
    const result = await setupTwoFactor(userId)
    res.json(result)
  }),
)

router.post(
  "/2fa/verify",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId!
    const data = twoFactorSchema.parse(req.body)
    const result = await verifyTwoFactor(userId, data)
    res.json(result)
  }),
)

export default router
