//Anonymous Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createAnonymousUserSchema = z.object({
  name: z.string().optional().default("Guest"),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional(),
})

export const startSurveySchema = z.object({
  categoryId: z.string().optional(),
})

export const submitVoteSchema = z.object({
  placeId: z.string(),
  isLiked: z.boolean(),
})

// Create anonymous user
export const createAnonymousUser = async (req: Request, res: Response) => {
  try {
    const data = createAnonymousUserSchema.parse(req.body)

    const anonymousUser = await prisma.anonymousUser.create({
      data: {
        name: data.name,
        gender: data.gender,
      },
    })

    res.status(201).json({
      id: anonymousUser.id,
      name: anonymousUser.name,
      gender: anonymousUser.gender,
      createdAt: anonymousUser.createdAt,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get anonymous user preferences
export const getAnonymousUserPreferences = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const anonymousUser = await prisma.anonymousUser.findUnique({
      where: { id },
    })

    if (!anonymousUser) {
      return res.status(404).json({ error: "Anonymous user not found" })
    }

    const preferences = await prisma.userPreferenceInsight.findMany({
      where: { anonymousUserId: id },
      include: { category: true },
    })

    res.json(preferences)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Start a survey
export const startSurvey = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = startSurveySchema.parse(req.body)

    const anonymousUser = await prisma.anonymousUser.findUnique({
      where: { id },
    })

    if (!anonymousUser) {
      return res.status(404).json({ error: "Anonymous user not found" })
    }

    // Create a new survey
    const survey = await prisma.survey.create({
      data: {
        anonymousUserId: id,
        lastCategoryId: data.categoryId,
      },
    })

    // Get places to show in the survey
    let places = []

    if (data.categoryId) {
      // Get places from specific category
      places = await prisma.place.findMany({
        where: {
          categoryId: data.categoryId,
          isActive: true,
        },
        take: 10,
        orderBy: {
          recommendationScore: "desc",
        },
      })
    } else {
      // Get places from all categories
      const categories = await prisma.placeCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      })

      // Get 2 places from each category
      for (const category of categories) {
        const categoryPlaces = await prisma.place.findMany({
          where: {
            categoryId: category.id,
            isActive: true,
          },
          take: 2,
          orderBy: {
            recommendationScore: "desc",
          },
        })
        places.push(...categoryPlaces)
      }
    }

    // Update view count for each place
    await Promise.all(
      places.map((place) =>
        prisma.place.update({
          where: { id: place.id },
          data: { viewCount: { increment: 1 } },
        }),
      ),
    )

    res.json({
      survey,
      places,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Submit a vote for a place
export const submitPlaceVote = async (req: Request, res: Response) => {
  try {
    const { id, surveyId } = req.params
    const data = submitVoteSchema.parse(req.body)

    const anonymousUser = await prisma.anonymousUser.findUnique({
      where: { id },
    })

    if (!anonymousUser) {
      return res.status(404).json({ error: "Anonymous user not found" })
    }

    const survey = await prisma.survey.findUnique({
      where: {
        id: surveyId,
        anonymousUserId: id,
      },
    })

    if (!survey) {
      return res.status(404).json({ error: "Survey not found" })
    }

    // Check if place exists
    const place = await prisma.place.findUnique({
      where: { id: data.placeId },
      include: { category: true },
    })

    if (!place) {
      return res.status(404).json({ error: "Place not found" })
    }

    // Create or update vote
    const vote = await prisma.placeVote.upsert({
      where: {
        surveyId_placeId_anonymousUserId: {
          surveyId,
          placeId: data.placeId,
          anonymousUserId: id,
        },
      },
      update: {
        isLiked: data.isLiked,
      },
      create: {
        surveyId,
        placeId: data.placeId,
        anonymousUserId: id,
        isLiked: data.isLiked,
      },
    })

    // Update place recommendation score
    await prisma.place.update({
      where: { id: data.placeId },
      data: {
        recommendationScore: {
          increment: data.isLiked ? 0.1 : -0.05, // Increase score for likes, decrease for dislikes
        },
      },
    })

    // Update user preference insights
    const preferenceInsight = await prisma.userPreferenceInsight.findUnique({
      where: {
        anonymousUserId_categoryId: {
          anonymousUserId: id,
          categoryId: place.categoryId,
        },
      },
    })

    if (preferenceInsight) {
      // Parse existing preference data
      const preferenceData = JSON.parse(preferenceInsight.preferenceData)

      // Update preference data
      preferenceData.voteCount = (preferenceData.voteCount || 0) + 1
      preferenceData.likeCount = data.isLiked ? (preferenceData.likeCount || 0) + 1 : preferenceData.likeCount || 0

      // Calculate like ratio
      preferenceData.likeRatio = preferenceData.likeCount / preferenceData.voteCount

      // Update attributes
      if (!preferenceData.attributes) preferenceData.attributes = {}

      // Get place attributes
      const placeAttributes = await prisma.placeAttribute.findMany({
        where: { placeId: data.placeId },
      })

      // Update attribute preferences
      for (const attr of placeAttributes) {
        if (!preferenceData.attributes[attr.key]) {
          preferenceData.attributes[attr.key] = {}
        }

        if (!preferenceData.attributes[attr.key][attr.value]) {
          preferenceData.attributes[attr.key][attr.value] = {
            count: 0,
            likeCount: 0,
          }
        }

        preferenceData.attributes[attr.key][attr.value].count++
        if (data.isLiked) {
          preferenceData.attributes[attr.key][attr.value].likeCount++
        }
      }

      // Update preference insight
      await prisma.userPreferenceInsight.update({
        where: { id: preferenceInsight.id },
        data: {
          preferenceData: JSON.stringify(preferenceData),
        },
      })
    } else {
      // Create new preference insight
      const preferenceData: {
        voteCount: number
        likeCount: number
        likeRatio: number
        attributes: Record<string, Record<string, { count: number; likeCount: number }>>
      } = {
        voteCount: 1,
        likeCount: data.isLiked ? 1 : 0,
        likeRatio: data.isLiked ? 1 : 0,
        attributes: {},
      }

      // Get place attributes
      const placeAttributes = await prisma.placeAttribute.findMany({
        where: { placeId: data.placeId },
      })

      // Initialize attribute preferences
      for (const attr of placeAttributes) {
        if (!preferenceData.attributes[attr.key]) {
          preferenceData.attributes[attr.key] = {}
        }

        preferenceData.attributes[attr.key][attr.value] = {
          count: 1,
          likeCount: data.isLiked ? 1 : 0,
        }
      }

      // Create preference insight
      await prisma.userPreferenceInsight.create({
        data: {
          anonymousUserId: id,
          categoryId: place.categoryId,
          preferenceData: JSON.stringify(preferenceData),
        },
      })
    }

    // Get next place to show
    const nextPlace = await prisma.place.findFirst({
      where: {
        categoryId: place.categoryId,
        isActive: true,
        id: { not: data.placeId },
        NOT: {
          placeVotes: {
            some: {
              surveyId,
              anonymousUserId: id,
            },
          },
        },
      },
      orderBy: {
        recommendationScore: "desc",
      },
    })

    if (nextPlace) {
      // Update view count
      await prisma.place.update({
        where: { id: nextPlace.id },
        data: { viewCount: { increment: 1 } },
      })
    }

    res.json({
      vote,
      nextPlace,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Complete a survey
export const completeSurvey = async (req: Request, res: Response) => {
  try {
    const { id, surveyId } = req.params

    const anonymousUser = await prisma.anonymousUser.findUnique({
      where: { id },
    })

    if (!anonymousUser) {
      return res.status(404).json({ error: "Anonymous user not found" })
    }

    const survey = await prisma.survey.findUnique({
      where: {
        id: surveyId,
        anonymousUserId: id,
      },
    })

    if (!survey) {
      return res.status(404).json({ error: "Survey not found" })
    }

    // Update survey status
    const updatedSurvey = await prisma.survey.update({
      where: { id: surveyId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    })

    // Get votes from this survey
    const votes = await prisma.placeVote.findMany({
      where: { surveyId },
      include: { place: true },
    })

    // Generate recommendations based on votes
    const likedPlaceIds = votes.filter((v) => v.isLiked).map((v) => v.placeId)
    const likedCategoryIds = [...new Set(votes.filter((v) => v.isLiked).map((v) => v.place.categoryId))]

    res.json({
      survey: updatedSurvey,
      stats: {
        totalVotes: votes.length,
        likedPlaces: likedPlaceIds.length,
        categories: likedCategoryIds.length,
      },
      message: "Survey completed successfully",
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get recommended places
export const getRecommendedPlaces = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { limit = "5", categoryId } = req.query

    const anonymousUser = await prisma.anonymousUser.findUnique({
      where: { id },
    })

    if (!anonymousUser) {
      return res.status(404).json({ error: "Anonymous user not found" })
    }

    // Get user preferences
    const preferences = await prisma.userPreferenceInsight.findMany({
      where: {
        anonymousUserId: id,
        ...(categoryId ? { categoryId: categoryId as string } : {}),
      },
    })

    if (preferences.length === 0) {
      // If no preferences, return top-rated places
      const topPlaces = await prisma.place.findMany({
        where: {
          isActive: true,
          ...(categoryId ? { categoryId: categoryId as string } : {}),
        },
        orderBy: {
          recommendationScore: "desc",
        },
        take: Number.parseInt(limit as string),
        include: {
          category: true,
          location: true,
          placeAttributes: true,
        },
      })

      return res.json({
        places: topPlaces,
        source: "top_rated",
      })
    }

    // Get places the user has already voted on
    const votedPlaceIds = (
      await prisma.placeVote.findMany({
        where: { anonymousUserId: id },
        select: { placeId: true },
      })
    ).map((v) => v.placeId)

    // Find places based on user preferences
    const recommendedPlaces = await prisma.place.findMany({
      where: {
        isActive: true,
        id: { notIn: votedPlaceIds },
        ...(categoryId
          ? { categoryId: categoryId as string }
          : {
              categoryId: {
                in: preferences.map((p) => p.categoryId),
              },
            }),
      },
      orderBy: {
        recommendationScore: "desc",
      },
      take: Number.parseInt(limit as string),
      include: {
        category: true,
        location: true,
        placeAttributes: true,
      },
    })

    res.json({
      places: recommendedPlaces,
      source: "personalized",
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
