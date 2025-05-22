//Review Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

export const createReviewSchema = z.object({
  serviceId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
})

export const createUserReview = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = createReviewSchema.parse(req.body)

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId, userId },
    })
    if (!service || service.status !== "COMPLETED") {
      return res.status(400).json({ error: "Invalid or incomplete service" })
    }

    const review = await prisma.review.create({
      data: {
        serviceId: data.serviceId,
        userId,
        rating: data.rating,
        comment: data.comment,
      },
    })

    // Update driver rating
    if (service.driverId) {
      const driverReviews = await prisma.review.findMany({
        where: { service: { driverId: service.driverId } },
      })
      const avgRating = driverReviews.reduce((sum, r) => sum + r.rating, 0) / driverReviews.length
      await prisma.driverProfile.update({
        where: { id: service.driverId },
        data: { rating: avgRating },
      })
    }

    res.status(201).json(review)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const createDriverReview = async (req: Request, res: Response) => {
  try {
    const driver = (req as any).driver
    const data = createReviewSchema.parse(req.body)

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId, driverId: driver.id },
    })
    if (!service || service.status !== "COMPLETED") {
      return res.status(400).json({ error: "Invalid or incomplete service" })
    }

    const review = await prisma.driverToUserReview.create({
      data: {
        serviceId: data.serviceId,
        driverId: driver.id,
        userId: service.userId,
        rating: data.rating,
        comment: data.comment,
      },
    })

    res.status(201).json(review)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getDriverReviews = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const reviews = await prisma.review.findMany({
      where: { service: { driverId: id } },
      include: { user: true },
    })
    res.json(reviews)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getUserReviews = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const reviews = await prisma.driverToUserReview.findMany({
      where: { userId: id },
      include: { driver: true },
    })
    res.json(reviews)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
