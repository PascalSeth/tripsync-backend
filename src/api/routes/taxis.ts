//taxis.ts
import { Router } from "express"
import { bookTaxi } from "../controllers/taxiController"
import { requireAuth } from "@clerk/express"

const router = Router()

router.post("/book", requireAuth(), bookTaxi)

export default router
