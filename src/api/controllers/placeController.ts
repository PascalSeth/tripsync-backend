//placeController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const createPlaceCategorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

export const updatePlaceCategorySchema = createPlaceCategorySchema.partial()

export const createPlaceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  rating: z.number().min(0).max(5).optional(),
  priceLevel: z.enum(["BUDGET", "MODERATE", "EXPENSIVE", "LUXURY"]).optional(),
  contactInfo: z.string().optional(),
  websiteUrl: z.string().optional(),
  openingHours: z.string().optional(), // JSON string
  tags: z.string().optional(), // Comma-separated
  isActive: z.boolean().optional(),
  recommendationScore: z.number().optional(),
  attributes: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
})

export const updatePlaceSchema = createPlaceSchema.partial()

// Place Category Management
export const createPlaceCategory = async (req: Request, res: Response) => {
  try {
    const data = createPlaceCategorySchema.parse(req.body)

    // Check if name is already in use
    const existingCategory = await prisma.placeCategory.findFirst({
      where: { name: data.name },
    })

    if (existingCategory) {
      return res.status(400).json({ error: "Category name already in use" })
    }

    const category = await prisma.placeCategory.create({
      data,
    })

    res.status(201).json(category)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getPlaceCategories = async (req: Request, res: Response) => {
  try {
    const { isActive } = req.query

    const whereClause: any = {}

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    const categories = await prisma.placeCategory.findMany({
      where: whereClause,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })

    // Get place counts
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const placesCount = await prisma.place.count({
          where: { categoryId: category.id },
        })

        return {
          ...category,
          _count: {
            places: placesCount,
          },
        }
      }),
    )

    res.json(categoriesWithCounts)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getPlaceCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const category = await prisma.placeCategory.findUnique({
      where: { id },
    })

    if (!category) {
      return res.status(404).json({ error: "Category not found" })
    }

    // Get places count
    const placesCount = await prisma.place.count({
      where: { categoryId: id },
    })

    // Get most popular places in this category
    const popularPlaces = await prisma.place.findMany({
      where: {
        categoryId: id,
        isActive: true,
      },
      orderBy: [{ recommendationScore: "desc" }, { viewCount: "desc" }],
      take: 5,
    })

    // Get voting statistics
    const [totalVotes, likedVotes] = await Promise.all([
      prisma.placeVote.count({
        where: {
          place: { categoryId: id },
        },
      }),
      prisma.placeVote.count({
        where: {
          isLiked: true,
          place: { categoryId: id },
        },
      }),
    ])

    res.json({
      ...category,
      _count: {
        places: placesCount,
      },
      popularPlaces,
      voteStats: {
        totalVotes,
        likedVotes,
        likeRatio: totalVotes > 0 ? likedVotes / totalVotes : 0,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updatePlaceCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updatePlaceCategorySchema.parse(req.body)

    // Check if category exists
    const category = await prisma.placeCategory.findUnique({
      where: { id },
    })

    if (!category) {
      return res.status(404).json({ error: "Category not found" })
    }

    // Check if name is already in use by another category
    if (data.name && data.name !== category.name) {
      const existingCategory = await prisma.placeCategory.findFirst({
        where: {
          name: data.name,
          id: { not: id },
        },
      })

      if (existingCategory) {
        return res.status(400).json({ error: "Category name already in use" })
      }
    }

    const updatedCategory = await prisma.placeCategory.update({
      where: { id },
      data,
    })

    res.json(updatedCategory)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deletePlaceCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if category has places
    const placesCount = await prisma.place.count({
      where: { categoryId: id },
    })

    if (placesCount > 0) {
      return res.status(400).json({
        error: "Cannot delete category that has places",
        placesCount,
      })
    }

    // Check if category has user preferences
    const preferencesCount = await prisma.userPreferenceInsight.count({
      where: { categoryId: id },
    })

    if (preferencesCount > 0) {
      return res.status(400).json({
        error: "Cannot delete category that has user preferences",
        preferencesCount,
      })
    }

    await prisma.placeCategory.delete({
      where: { id },
    })

    res.json({ message: "Category deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Place Management
export const createPlace = async (req: Request, res: Response) => {
  try {
    const { attributes, ...data } = createPlaceSchema.parse(req.body)

    // Check if category exists
    const category = await prisma.placeCategory.findUnique({
      where: { id: data.categoryId },
    })

    if (!category) {
      return res.status(400).json({ error: "Category not found" })
    }

    // Check if location exists if provided
    if (data.locationId) {
      const location = await prisma.location.findUnique({
        where: { id: data.locationId },
      })

      if (!location) {
        return res.status(400).json({ error: "Location not found" })
      }
    }

    // Create place
    const place = await prisma.place.create({
      data,
    })

    // Create attributes if provided
    if (attributes && attributes.length > 0) {
      await prisma.placeAttribute.createMany({
        data: attributes.map((attr) => ({
          placeId: place.id,
          key: attr.key,
          value: attr.value,
        })),
      })
    }

    // Fetch place with attributes
    const placeWithAttributes = await prisma.place.findUnique({
      where: { id: place.id },
      include: {
        category: true,
        location: true,
        placeAttributes: true,
      },
    })

    res.status(201).json(placeWithAttributes)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getPlaces = async (req: Request, res: Response) => {
  try {
    const { categoryId, isActive, search } = req.query

    const whereClause: any = {}

    if (categoryId) {
      whereClause.categoryId = categoryId
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
        { tags: { contains: search as string, mode: "insensitive" } },
      ]
    }

    const places = await prisma.place.findMany({
      where: whereClause,
      include: {
        category: true,
        location: true,
        _count: {
          select: {
            placeVotes: true,
          },
        },
      },
      orderBy: [{ recommendationScore: "desc" }, { name: "asc" }],
    })

    res.json(places)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getPlace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const place = await prisma.place.findUnique({
      where: { id },
      include: {
        category: true,
        location: true,
        placeAttributes: true,
        _count: {
          select: {
            placeVotes: true,
            service: true,
          },
        },
      },
    })

    if (!place) {
      return res.status(404).json({ error: "Place not found" })
    }

    // Get vote statistics
    const [totalVotes, likedVotes] = await Promise.all([
      prisma.placeVote.count({
        where: { placeId: id },
      }),
      prisma.placeVote.count({
        where: {
          placeId: id,
          isLiked: true,
        },
      }),
    ])

    // Increment view count
    await prisma.place.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    })

    res.json({
      ...place,
      voteStats: {
        totalVotes,
        likedVotes,
        likeRatio: totalVotes > 0 ? likedVotes / totalVotes : 0,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updatePlace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { attributes, ...data } = updatePlaceSchema.parse(req.body)

    // Check if place exists
    const place = await prisma.place.findUnique({
      where: { id },
    })

    if (!place) {
      return res.status(404).json({ error: "Place not found" })
    }

    // Check if category exists if provided
    if (data.categoryId) {
      const category = await prisma.placeCategory.findUnique({
        where: { id: data.categoryId },
      })

      if (!category) {
        return res.status(400).json({ error: "Category not found" })
      }
    }

    // Check if location exists if provided
    if (data.locationId) {
      const location = await prisma.location.findUnique({
        where: { id: data.locationId },
      })

      if (!location) {
        return res.status(400).json({ error: "Location not found" })
      }
    }

    // Update place
    const updatedPlace = await prisma.place.update({
      where: { id },
      data,
    })

    // Update attributes if provided
    if (attributes && attributes.length > 0) {
      // Delete existing attributes
      await prisma.placeAttribute.deleteMany({
        where: { placeId: id },
      })

      // Create new attributes
      await prisma.placeAttribute.createMany({
        data: attributes.map((attr) => ({
          placeId: id,
          key: attr.key,
          value: attr.value,
        })),
      })
    }

    // Fetch updated place with attributes
    const placeWithAttributes = await prisma.place.findUnique({
      where: { id },
      include: {
        category: true,
        location: true,
        placeAttributes: true,
      },
    })

    res.json(placeWithAttributes)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deletePlace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check if place has votes
    const votesCount = await prisma.placeVote.count({
      where: { placeId: id },
    })

    if (votesCount > 0) {
      return res.status(400).json({
        error: "Cannot delete place that has votes",
        votesCount,
      })
    }

    // Check if place has services
    const servicesCount = await prisma.service.count({
      where: { placeId: id },
    })

    if (servicesCount > 0) {
      return res.status(400).json({
        error: "Cannot delete place that has services",
        servicesCount,
      })
    }

    // Delete place attributes
    await prisma.placeAttribute.deleteMany({
      where: { placeId: id },
    })

    // Delete place
    await prisma.place.delete({
      where: { id },
    })

    res.json({ message: "Place deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Recommendation Model Management
export const createRecommendationModel = async (req: Request, res: Response) => {
  try {
    const { name, version, description, parameters, isActive } = req.body

    // Check if model name is already in use
    const existingModel = await prisma.recommendationModel.findUnique({
      where: { name },
    })

    if (existingModel) {
      return res.status(400).json({ error: "Model name already in use" })
    }

    const model = await prisma.recommendationModel.create({
      data: {
        name,
        version,
        description,
        parameters,
        isActive: isActive ?? true,
      },
    })

    res.status(201).json(model)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getRecommendationModels = async (req: Request, res: Response) => {
  try {
    const { isActive } = req.query

    const whereClause: any = {}

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true"
    }

    const models = await prisma.recommendationModel.findMany({
      where: whereClause,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    })

    res.json(models)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getRecommendationModel = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const model = await prisma.recommendationModel.findUnique({
      where: { id },
    })

    if (!model) {
      return res.status(404).json({ error: "Recommendation model not found" })
    }

    res.json(model)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateRecommendationModel = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, version, description, parameters, isActive, accuracy, lastTrainedAt } = req.body

    // Check if model exists
    const model = await prisma.recommendationModel.findUnique({
      where: { id },
    })

    if (!model) {
      return res.status(404).json({ error: "Recommendation model not found" })
    }

    // Check if name is already in use by another model
    if (name && name !== model.name) {
      const existingModel = await prisma.recommendationModel.findUnique({
        where: { name },
      })

      if (existingModel && existingModel.id !== id) {
        return res.status(400).json({ error: "Model name already in use" })
      }
    }

    const updatedModel = await prisma.recommendationModel.update({
      where: { id },
      data: {
        name,
        version,
        description,
        parameters,
        isActive,
        accuracy,
        lastTrainedAt: lastTrainedAt ? new Date(lastTrainedAt) : undefined,
      },
    })

    res.json(updatedModel)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const deleteRecommendationModel = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await prisma.recommendationModel.delete({
      where: { id },
    })

    res.json({ message: "Recommendation model deleted successfully" })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
