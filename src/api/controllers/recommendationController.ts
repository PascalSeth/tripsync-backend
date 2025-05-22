//Recommendation Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const startSurveySchema = z.object({
  categoryId: z.string().optional(),
})

export const submitVoteSchema = z.object({
  placeId: z.string(),
  isLiked: z.boolean(),
})

// Get place categories
export const getPlaceCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.placeCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    })

    res.json(categories)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get places by category
export const getPlacesByCategory = async (req: Request, res: Response) => {
  try {
    const { categoryId, limit = "10", offset = "0" } = req.query

    const places = await prisma.place.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId: categoryId as string } : {}),
      },
      orderBy: {
        recommendationScore: "desc",
      },
      take: Number.parseInt(limit as string),
      skip: Number.parseInt(offset as string),
      include: {
        category: true,
        location: true,
      },
    })

    const total = await prisma.place.count({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId: categoryId as string } : {}),
      },
    })

    res.json({
      places,
      pagination: {
        total,
        limit: Number.parseInt(limit as string),
        offset: Number.parseInt(offset as string),
        hasMore: Number.parseInt(offset as string) + places.length < total,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get place details
export const getPlaceDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const place = await prisma.place.findUnique({
      where: { id },
      include: {
        category: true,
        location: true,
        placeAttributes: true,
      },
    })

    if (!place) {
      return res.status(404).json({ error: "Place not found" })
    }

    // Increment view count
    await prisma.place.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    })

    res.json(place)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get recommended places for authenticated user
export const getRecommendedPlaces = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { limit = "5", categoryId } = req.query

    // Get user preferences
    const preferences = await prisma.userPreferenceInsight.findMany({
      where: {
        userId,
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
        where: { userId },
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

// Start a place survey
export const startPlaceSurvey = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = startSurveySchema.parse(req.body)

    // Create a new survey
    const survey = await prisma.survey.create({
      data: {
        userId,
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
    const userId = (req as any).auth?.userId
    const { id: surveyId } = req.params
    const data = submitVoteSchema.parse(req.body)

    const survey = await prisma.survey.findUnique({
      where: {
        id: surveyId,
        userId,
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
        surveyId_placeId_userId: {
          surveyId,
          placeId: data.placeId,
          userId,
        },
      },
      update: {
        isLiked: data.isLiked,
      },
      create: {
        surveyId,
        placeId: data.placeId,
        userId,
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
        userId_categoryId: {
          userId,
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
      // Update the preferenceData type definition
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
      // And when updating attributes, use the proper typing:
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
          userId,
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
              userId,
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
    const userId = (req as any).auth?.userId
    const { id: surveyId } = req.params

    const survey = await prisma.survey.findUnique({
      where: {
        id: surveyId,
        userId,
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

    // Get recommended places
    const recommendedPlaces = await prisma.place.findMany({
      where: {
        isActive: true,
        id: { notIn: votes.map((v) => v.placeId) },
        categoryId: { in: likedCategoryIds },
      },
      orderBy: {
        recommendationScore: "desc",
      },
      take: 5,
      include: {
        category: true,
        location: true,
      },
    })

    res.json({
      survey: updatedSurvey,
      stats: {
        totalVotes: votes.length,
        likedPlaces: likedPlaceIds.length,
        categories: likedCategoryIds.length,
      },
      recommendations: recommendedPlaces,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
