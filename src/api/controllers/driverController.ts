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
