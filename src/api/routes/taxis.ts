//taxis.ts
import { Router } from "express"
import { bookTaxi } from "../controllers/taxiController"
import { driverOnly } from "../middlewares/authMiddleware"

const router = Router()

router.post("/book", driverOnly, bookTaxi)

export default router
