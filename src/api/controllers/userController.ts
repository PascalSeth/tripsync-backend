//User Controller
import { z } from "zod"
import { prisma } from "../../config/prisma"

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(10).optional(),
  address: z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional(),
})

export const favoriteLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  address: z.string(),
  city: z.string(),
  country: z.string(),
  label: z.string(),
})

export const getProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { driver: true, favoriteLocations: true },
  })
  if (!user) {
    throw new Error("User not found")
  }
  return user
}

export const updateProfile = async (userId: string, data: z.infer<typeof updateProfileSchema>) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    include: { driver: true, favoriteLocations: true },
  })
  return user
}

export const addFavoriteLocation = async (userId: string, data: z.infer<typeof favoriteLocationSchema>) => {
  const location = await prisma.location.create({
    data: {
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      city: data.city,
      country: data.country,
    },
  })

  const favoriteLocation = await prisma.favoriteLocation.create({
    data: {
      userId,
      locationId: location.id,
      label: data.label,
    },
  })

  return favoriteLocation
}
