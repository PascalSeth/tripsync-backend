//Driver Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import { supabase } from "../../config/supabase"
import type { UploadedFile } from "express-fileupload"

export const createDriverProfileSchema = z.object({
  driversLicense: z.string(),
  licenseExpiryDate: z.string().datetime(),
  vehicleTypeId: z.string().uuid(),
  dayBookingPrice: z.number().optional(),
  isAvailableForDayBooking: z.boolean().optional().default(false),
  isTaxiDriver: z.boolean().optional().default(false),
  vehicle: z.object({
    registrationNumber: z.string(),
    make: z.string(),
    model: z.string(),
    year: z
      .number()
      .min(1900)
      .max(new Date().getFullYear() + 1),
    color: z.string(),
    seats: z.number().min(1),
    insuranceNumber: z.string(),
    insuranceExpiryDate: z.string().datetime(),
    inspectionDate: z.string().datetime(),
    photos: z.array(z.string()).optional(),
  }),
})

export const updateDriverProfileSchema = z.object({
  driversLicense: z.string().optional(),
  licenseExpiryDate: z.string().datetime().optional(),
  vehicleTypeId: z.string().uuid().optional(),
  dayBookingPrice: z.number().optional(),
  currentStatus: z.enum(["ONLINE", "OFFLINE", "ON_TRIP", "BREAK"]).optional(),
  isAvailableForDayBooking: z.boolean().optional(),
  isTaxiDriver: z.boolean().optional(),
  vehicle: z
    .object({
      registrationNumber: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      year: z
        .number()
        .min(1900)
        .max(new Date().getFullYear() + 1)
        .optional(),
      color: z.string().optional(),
      seats: z.number().min(1).optional(),
      insuranceNumber: z.string().optional(),
      insuranceExpiryDate: z.string().datetime().optional(),
      inspectionDate: z.string().datetime().optional(),
      photos: z.array(z.string()).optional(),
    })
    .optional(),
})

export const updateDriverStatusSchema = z.object({
  currentStatus: z.enum(["ONLINE", "OFFLINE", "ON_TRIP", "BREAK"]),
})

const allowedImageTypes = ["image/jpeg", "image/png"]
const allowedPdfType = "application/pdf"

const validateFile = (file: UploadedFile, allowedTypes: string[], maxSize: number) => {
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`Invalid file type for ${file.name}. Allowed types: ${allowedTypes.join(", ")}`)
  }
  if (file.size > maxSize) {
    throw new Error(`File ${file.name} exceeds maximum size of ${maxSize / (1024 * 1024)}MB`)
  }
}

const uploadFileToSupabase = async (file: UploadedFile, userId: string, field: string) => {
  const timestamp = Date.now()
  const filePath = `driver-documents/${userId}/${field}/${timestamp}_${file.name}`
  const { data, error } = await supabase.storage
    .from("driver-documents")
    .upload(filePath, file.data, { contentType: file.mimetype })
  if (error) {
    throw new Error(`Failed to upload ${field}: ${error.message}`)
  }
  const { publicUrl } = supabase.storage.from("driver-documents").getPublicUrl(filePath).data
  return publicUrl
}
// Schema for updating driver location
export const updateDriverLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string(),
  city: z.string(),
  state: z.string().optional(),
  country: z.string(),
  postalCode: z.string().optional(),
  placeId: z.string().optional(),
  gpsAccuracy: z.number().optional(),
})

// Schema for toggling driver availability
export const toggleDriverAvailabilitySchema = z.object({
  isAvailableForDayBooking: z.boolean(),
  dayBookingPrice: z.number().optional(),
})

// Update Driver Location
export const updateDriverLocation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = updateDriverLocationSchema.parse(req.body)

    // Check if driver profile exists
    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
    })
    if (!profile) {
      return res.status(404).json({ error: "Driver profile not found" })
    }

    // Create or update location
    const location = await prisma.location.upsert({
      where: { id: profile.currentLocationId || "non-existent-id" },
      update: {
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        postalCode: data.postalCode,
        placeId: data.placeId,
        gpsAccuracy: data.gpsAccuracy,
      },
      create: {
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        postalCode: data.postalCode,
        placeId: data.placeId,
        gpsAccuracy: data.gpsAccuracy,
      },
    })

    // Update driver profile with location
    await prisma.driverProfile.update({
      where: { userId },
      data: {
        currentLocationId: location.id,
        lastActiveAt: new Date(),
      },
    })

    // Emit Socket.IO event for real-time location update
    ;(req as any).io?.to(`driver:${userId}`).emit("driver:location_updated", {
      driverId: userId,
      location: {
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
      },
    })

    res.json({
      message: "Location updated successfully",
      location,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Toggle Driver Availability
export const toggleDriverAvailability = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = toggleDriverAvailabilitySchema.parse(req.body)

    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
    })
    if (!profile) {
      return res.status(404).json({ error: "Driver profile not found" })
    }

    // If enabling day booking availability, ensure price is set
    if (data.isAvailableForDayBooking && !data.dayBookingPrice && !profile.dayBookingPrice) {
      return res.status(400).json({ 
        error: "Day booking price is required when enabling day booking availability" 
      })
    }

    const updateData: any = {
      isAvailableForDayBooking: data.isAvailableForDayBooking,
    }

    if (data.dayBookingPrice) {
      updateData.dayBookingPrice = data.dayBookingPrice
    }

    const updatedProfile = await prisma.driverProfile.update({
      where: { userId },
      data: updateData,
    })

    // Emit Socket.IO event for availability change
    ;(req as any).io?.to(`driver:${userId}`).emit("driver:availability_updated", {
      driverId: userId,
      isAvailableForDayBooking: data.isAvailableForDayBooking,
      dayBookingPrice: data.dayBookingPrice || profile.dayBookingPrice,
    })

    res.json({
      message: "Availability updated successfully",
      profile: updatedProfile,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get Driver Bookings
export const getDriverBookings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { status, page = 1, limit = 10, dateFrom, dateTo } = req.query

    // Check if driver profile exists
    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
    })
    if (!profile) {
      return res.status(404).json({ error: "Driver profile not found" })
    }

    // Build filter conditions
    const whereConditions: any = {
      driverId: userId,
    }

    if (status) {
      whereConditions.status = status
    }

    if (dateFrom || dateTo) {
      whereConditions.createdAt = {}
      if (dateFrom) {
        whereConditions.createdAt.gte = new Date(dateFrom as string)
      }
      if (dateTo) {
        whereConditions.createdAt.lte = new Date(dateTo as string)
      }
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)

    // Get bookings with related data
    const bookings = await prisma.service.findMany({
      where: whereConditions,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            profileImage: true,
          },
        },
        serviceType: true,
        pickupLocation: true,
        dropoffLocation: true,
        payment: true,
        review: true,
        district: true,
        store: {
          include: {
            location: true,
          },
        },
        orderItems: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: parseInt(limit as string),
    })

    // Get total count for pagination
    const totalCount = await prisma.service.count({
      where: whereConditions,
    })

    const totalPages = Math.ceil(totalCount / parseInt(limit as string))

    res.json({
      bookings,
      pagination: {
        currentPage: parseInt(page as string),
        totalPages,
        totalCount,
        hasNextPage: parseInt(page as string) < totalPages,
        hasPreviousPage: parseInt(page as string) > 1,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get Driver Earnings
export const getDriverEarnings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const { period = 'monthly', year, month } = req.query

    // Check if driver profile exists
    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
    })
    if (!profile) {
      return res.status(404).json({ error: "Driver profile not found" })
    }

    // Build date filter based on period
    let dateFilter: any = {}
    const now = new Date()
    
    switch (period) {
      case 'daily':
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        dateFilter = {
          paymentDate: {
            gte: today,
            lt: tomorrow,
          },
        }
        break
      
      case 'weekly':
        const weekStart = new Date()
        weekStart.setDate(weekStart.getDate() - weekStart.getDay())
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 7)
        dateFilter = {
          paymentDate: {
            gte: weekStart,
            lt: weekEnd,
          },
        }
        break
      
      case 'monthly':
        const monthStart = new Date(
          parseInt(year as string) || now.getFullYear(),
          parseInt(month as string) - 1 || now.getMonth(),
          1
        )
        const monthEnd = new Date(monthStart)
        monthEnd.setMonth(monthEnd.getMonth() + 1)
        dateFilter = {
          paymentDate: {
            gte: monthStart,
            lt: monthEnd,
          },
        }
        break
      
      case 'yearly':
        const yearStart = new Date(parseInt(year as string) || now.getFullYear(), 0, 1)
        const yearEnd = new Date(yearStart)
        yearEnd.setFullYear(yearEnd.getFullYear() + 1)
        dateFilter = {
          paymentDate: {
            gte: yearStart,
            lt: yearEnd,
          },
        }
        break
    }

    // Get earnings data
    const payments = await prisma.payment.findMany({
      where: {
        service: {
          driverId: userId,
        },
        status: 'PAID',
        ...dateFilter,
      },
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
      },
      orderBy: {
        paymentDate: 'desc',
      },
    })

    // Calculate earnings summary
    const totalEarnings = payments.reduce((sum, payment) => sum + (payment.driverEarnings || 0), 0)
    const totalRides = payments.length
    const totalPlatformFees = payments.reduce((sum, payment) => sum + payment.platformFee, 0)
    const totalGrossEarnings = payments.reduce((sum, payment) => sum + payment.amount, 0)

    // Group earnings by service type
    const earningsByServiceType = payments.reduce((acc: any, payment) => {
      const serviceTypeName = payment.service.serviceType.name
      if (!acc[serviceTypeName]) {
        acc[serviceTypeName] = {
          count: 0,
          earnings: 0,
          grossAmount: 0,
        }
      }
      acc[serviceTypeName].count += 1
      acc[serviceTypeName].earnings += payment.driverEarnings || 0
      acc[serviceTypeName].grossAmount += payment.amount
      return acc
    }, {})

    // Get average rating
    const avgRating = await prisma.review.aggregate({
      where: {
        service: {
          driverId: userId,
        },
      },
      _avg: {
        driverRating: true,
      },
    })

    res.json({
      summary: {
        totalEarnings,
        totalRides,
        totalPlatformFees,
        totalGrossEarnings,
        averageEarningsPerRide: totalRides > 0 ? totalEarnings / totalRides : 0,
        averageRating: avgRating._avg.driverRating || 0,
      },
      earningsByServiceType,
      recentPayments: payments.slice(0, 10), // Last 10 payments
      period,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const createDriverProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = createDriverProfileSchema.parse(req.body)
    const files = req.files as { [key: string]: UploadedFile } | undefined

    if (!files) {
      return res.status(400).json({ error: "Missing required files" })
    }

    // Validate and upload files
    const requiredFiles = ["driversLicense", "nationalId", "registrationPic", "driverPic"]
    const optionalFiles = ["insuranceInfo"]
    const uploadedUrls: { [key: string]: string } = {}

    for (const field of requiredFiles) {
      const file = files[field]
      if (!file) {
        return res.status(400).json({ error: `Missing ${field} file` })
      }
      validateFile(file, allowedImageTypes, 5 * 1024 * 1024) // 5MB max
      uploadedUrls[field] = await uploadFileToSupabase(file, userId, field)
    }

    if (files.insuranceInfo) {
      const file = files.insuranceInfo
      validateFile(file, [allowedPdfType], 10 * 1024 * 1024) // 10MB max
      uploadedUrls.insuranceInfo = await uploadFileToSupabase(file, userId, "insuranceInfo")
    }

    // Verify vehicleTypeId exists
    const vehicleType = await prisma.vehicleType.findUnique({
      where: { id: data.vehicleTypeId },
    })
    if (!vehicleType) {
      return res.status(400).json({ error: "Invalid vehicle type" })
    }

    // Create vehicle with user-provided data
    const vehicle = await prisma.vehicle.create({
      data: {
        registrationNumber: data.vehicle.registrationNumber,
        make: data.vehicle.make,
        model: data.vehicle.model,
        year: data.vehicle.year,
        color: data.vehicle.color,
        seats: data.vehicle.seats,
        vehicleTypeId: data.vehicleTypeId,
        insuranceNumber: data.vehicle.insuranceNumber,
        insuranceExpiryDate: new Date(data.vehicle.insuranceExpiryDate),
        inspectionDate: new Date(data.vehicle.inspectionDate),
        photos: data.vehicle.photos || [],
        isActive: true,
      },
    })

    const existingProfile = await prisma.driverProfile.findUnique({
      where: { userId },
    })
    if (existingProfile) {
      return res.status(400).json({ error: "Driver profile already exists" })
    }

    const profile = await prisma.driverProfile.create({
      data: {
        userId,
        driversLicense: uploadedUrls.driversLicense,
        nationalId: uploadedUrls.nationalId,
        registrationPic: uploadedUrls.registrationPic,
        driverPic: uploadedUrls.driverPic,
        insuranceInfo: uploadedUrls.insuranceInfo,
        licenseExpiryDate: new Date(data.licenseExpiryDate),
        vehicleId: vehicle.id,
        dayBookingPrice: data.dayBookingPrice,
        isAvailableForDayBooking: data.dayBookingPrice ? true : data.isAvailableForDayBooking,
        isTaxiDriver: data.isTaxiDriver,
        approvalStatus: "PENDING",
        currentStatus: "OFFLINE",
      },
    })

    res.status(201).json(profile)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateDriverProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = updateDriverProfileSchema.parse(req.body)
    const files = req.files as { [key: string]: UploadedFile } | undefined

    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
    })
    if (!profile) {
      return res.status(404).json({ error: "Driver profile not found" })
    }

    const updateData: any = {}
    if (data.driversLicense) updateData.driversLicense = data.driversLicense
    if (data.licenseExpiryDate) updateData.licenseExpiryDate = new Date(data.licenseExpiryDate)
    if (data.dayBookingPrice) updateData.dayBookingPrice = data.dayBookingPrice
    if (data.currentStatus) updateData.currentStatus = data.currentStatus
    if (data.isAvailableForDayBooking !== undefined)
      updateData.isAvailableForDayBooking = data.dayBookingPrice ? true : data.isAvailableForDayBooking
    if (data.isTaxiDriver !== undefined) updateData.isTaxiDriver = data.isTaxiDriver

    if (data.vehicleTypeId) {
      const vehicleType = await prisma.vehicleType.findUnique({
        where: { id: data.vehicleTypeId },
      })
      if (!vehicleType) {
        return res.status(400).json({ error: "Invalid vehicle type" })
      }
      if (profile.vehicleId) {
        updateData.vehicle = { update: { vehicleTypeId: data.vehicleTypeId } }
      }
    }

    if (data.vehicle && profile.vehicleId) {
      const vehicleUpdate: any = {}
      if (data.vehicle.registrationNumber) vehicleUpdate.registrationNumber = data.vehicle.registrationNumber
      if (data.vehicle.make) vehicleUpdate.make = data.vehicle.make
      if (data.vehicle.model) vehicleUpdate.model = data.vehicle.model
      if (data.vehicle.year) vehicleUpdate.year = data.vehicle.year
      if (data.vehicle.color) vehicleUpdate.color = data.vehicle.color
      if (data.vehicle.seats) vehicleUpdate.seats = data.vehicle.seats
      if (data.vehicle.insuranceNumber) vehicleUpdate.insuranceNumber = data.vehicle.insuranceNumber
      if (data.vehicle.insuranceExpiryDate)
        vehicleUpdate.insuranceExpiryDate = new Date(data.vehicle.insuranceExpiryDate)
      if (data.vehicle.inspectionDate) vehicleUpdate.inspectionDate = new Date(data.vehicle.inspectionDate)
      if (data.vehicle.photos) vehicleUpdate.photos = data.vehicle.photos

      if (Object.keys(vehicleUpdate).length > 0) {
        await prisma.vehicle.update({
          where: { id: profile.vehicleId },
          data: vehicleUpdate,
        })
      }
    }

    // Handle file uploads
    if (files) {
      const fileFields = ["driversLicense", "nationalId", "registrationPic", "driverPic", "insuranceInfo"]
      for (const field of fileFields) {
        const file = files[field]
        if (file) {
          const allowedTypes = field === "insuranceInfo" ? [allowedPdfType] : allowedImageTypes
          const maxSize = field === "insuranceInfo" ? 10 * 1024 * 1024 : 5 * 1024 * 1024
          validateFile(file, allowedTypes, maxSize)
          updateData[field] = await uploadFileToSupabase(file, userId, field)
        }
      }
    }

    const updatedProfile = await prisma.driverProfile.update({
      where: { userId },
      data: updateData,
    })

    res.json(updatedProfile)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getDriverProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
      include: { currentLocation: true, vehicle: true },
    })
    if (!profile) {
      return res.status(404).json({ error: "Driver profile not found" })
    }
    res.json(profile)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateDriverStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = updateDriverStatusSchema.parse(req.body)

    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
    })
    if (!profile) {
      return res.status(404).json({ error: "Driver profile not found" })
    }

    if (profile.approvalStatus !== "APPROVED" && data.currentStatus !== "OFFLINE") {
      return res.status(403).json({ error: "Only approved drivers can change status to non-OFFLINE" })
    }

    const updatedProfile = await prisma.driverProfile.update({
      where: { userId },
      data: { currentStatus: data.currentStatus },
    })

    // Emit Socket.IO event for real-time status update
    ;(req as any).io.to(`driver:${userId}`).emit("driver:status_updated", {
      driverId: userId,
      status: data.currentStatus,
    })

    res.json(updatedProfile)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
