//Day Booking Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"
import { geocodingClient } from "../../config/mapbox"

// Schemas
export const checkAvailabilitySchema = z.object({
  districtId: z.string().uuid(),
  date: z.string().datetime(),
})

export const setDriverPriceSchema = z.object({
  districtId: z.string().uuid(),
  price: z.number().positive(),
})

export const setDriverScheduleSchema = z.object({
  availableDates: z.array(
    z.object({
      date: z.string().datetime(),
      isAvailable: z.boolean(),
    }),
  ),
  districtIds: z.array(z.string().uuid()),
})

export const bookDriverSchema = z.object({
  driverId: z.string().uuid(),
  districtId: z.string().uuid(),
  date: z.string().datetime(),
  pickupAddress: z.string(),
  notes: z.string().optional(),
})

// Check driver availability for a district and date
export const checkDriverAvailability = async (req: Request, res: Response) => {
  try {
    const data = checkAvailabilitySchema.parse(req.query)
    const bookingDate = new Date(data.date)

    // Format date to YYYY-MM-DD for comparison
    const formattedDate = bookingDate.toISOString().split("T")[0]

    // Find available drivers in the district
    const availableDrivers = await prisma.driverProfile.findMany({
      where: {
        isAvailableForDayBooking: true,
        approvalStatus: "APPROVED",
        dayBookingPrice: { not: null },
        // Check driver's district assignments
        driverDistricts: {
          some: {
            districtId: data.districtId,
          },
        },
        // Check driver's availability for the date
        driverAvailability: {
          some: {
            date: {
              gte: new Date(`${formattedDate}T00:00:00Z`),
              lt: new Date(`${formattedDate}T23:59:59Z`),
            },
            isAvailable: true,
          },
        },
        // Ensure driver is not already booked for this date
        NOT: {
          services: {
            some: {
              scheduledTime: {
                gte: new Date(`${formattedDate}T00:00:00Z`),
                lt: new Date(`${formattedDate}T23:59:59Z`),
              },
              status: {
                in: ["SCHEDULED", "DRIVER_ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"],
              },
              serviceType: {
                category: "DAY_BOOKING",
              },
            },
          },
        },
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            profileImage: true,
            phone: true,
          },
        },
        vehicle: true,
        driverDistricts: {
          where: {
            districtId: data.districtId,
          },
          include: {
            district: true,
          },
        },
      },
    })

    // Format response with pricing
    const drivers = availableDrivers.map((driver) => ({
      id: driver.id,
      name: `${driver.user.firstName} ${driver.user.lastName}`,
      profileImage: driver.user.profileImage,
      phone: driver.user.phone,
      rating: driver.rating,
      totalTrips: driver.totalTrips,
      vehicle: driver.vehicle
        ? {
            make: driver.vehicle.make,
            model: driver.vehicle.model,
            color: driver.vehicle.color,
            year: driver.vehicle.year,
          }
        : null,
      price: driver.dayBookingPrice,
      districtPrice: driver.driverDistricts[0]?.customPrice || driver.dayBookingPrice,
    }))

    res.json({
      date: bookingDate,
      districtId: data.districtId,
      availableDrivers: drivers,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Get day booking pricing for districts
export const getDayBookingPricing = async (req: Request, res: Response) => {
  try {
    // Get all districts with their base pricing
    const districts = await prisma.district.findMany({
      include: {
        region: true,
        driverDistricts: {
          include: {
            driver: {
              select: {
                dayBookingPrice: true,
                rating: true,
              },
            },
          },
        },
      },
    })

    // Calculate min, max, and average prices for each district
    const districtPricing = districts.map((district) => {
      const prices = district.driverDistricts
        .filter((dd) => dd.driver.dayBookingPrice !== null)
        .map((dd) => dd.customPrice || dd.driver.dayBookingPrice!)

      const minPrice = prices.length ? Math.min(...prices) : null
      const maxPrice = prices.length ? Math.max(...prices) : null
      const avgPrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null
      const availableDrivers = district.driverDistricts.length

      return {
        id: district.id,
        name: district.name,
        region: district.region.name,
        minPrice,
        maxPrice,
        avgPrice,
        availableDrivers,
      }
    })

    res.json(districtPricing)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Set driver price for day booking
export const setDriverPrice = async (req: Request, res: Response) => {
  try {
    const driver = (req as any).driver
    const data = setDriverPriceSchema.parse(req.body)

    // Check if district exists
    const district = await prisma.district.findUnique({
      where: { id: data.districtId },
    })

    if (!district) {
      return res.status(404).json({ error: "District not found" })
    }

    // Update or create driver district assignment
    const driverDistrict = await prisma.driverDistrict.upsert({
      where: {
        driverProfileId_districtId: {
          driverProfileId: driver.id,
          districtId: data.districtId,
        },
      },
      update: {
        customPrice: data.price,
      },
      create: {
        driverProfileId: driver.id,
        districtId: data.districtId,
        customPrice: data.price,
      },
    })

    // Update driver profile
    await prisma.driverProfile.update({
      where: { id: driver.id },
      data: {
        isAvailableForDayBooking: true,
        dayBookingPrice: data.price, // Set default price
      },
    })

    res.json({
      message: "Price updated successfully",
      driverDistrict,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Set driver availability schedule
export const setDriverSchedule = async (req: Request, res: Response) => {
  try {
    const driver = (req as any).driver
    const data = setDriverScheduleSchema.parse(req.body)

    // Validate districts
    const districts = await prisma.district.findMany({
      where: {
        id: { in: data.districtIds },
      },
    })

    if (districts.length !== data.districtIds.length) {
      return res.status(400).json({ error: "One or more districts not found" })
    }

    // Create or update district assignments
    const districtAssignments = await Promise.all(
      data.districtIds.map((districtId) =>
        prisma.driverDistrict.upsert({
          where: {
            driverProfileId_districtId: {
              driverProfileId: driver.id,
              districtId,
            },
          },
          update: {},
          create: {
            driverProfileId: driver.id,
            districtId,
            customPrice: driver.dayBookingPrice,
          },
        }),
      ),
    )

    // Create or update availability records
    const availabilityRecords = await Promise.all(
      data.availableDates.map((item) => {
        const date = new Date(item.date)
        // Format to YYYY-MM-DD
        const formattedDate = date.toISOString().split("T")[0]

        return prisma.driverAvailability.upsert({
          where: {
            driverProfileId_date: {
              driverProfileId: driver.id,
              date: new Date(`${formattedDate}T00:00:00Z`),
            },
          },
          update: {
            isAvailable: item.isAvailable,
          },
          create: {
            driverProfileId: driver.id,
            date: new Date(`${formattedDate}T00:00:00Z`),
            isAvailable: item.isAvailable,
          },
        })
      }),
    )

    res.json({
      message: "Schedule updated successfully",
      districtAssignments,
      availabilityRecords,
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

// Book a driver for a day
export const bookDriverForDay = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId;
    const data = bookDriverSchema.parse(req.body);
    const bookingDate = new Date(data.date);

    // Format date to YYYY-MM-DD for comparison
    const formattedDate = bookingDate.toISOString().split("T")[0];

    // Check if driver is available
    const driver = await prisma.driverProfile.findUnique({
      where: {
        id: data.driverId,
        isAvailableForDayBooking: true,
        approvalStatus: "APPROVED",
        driverDistricts: {
          some: {
            districtId: data.districtId,
          },
        },
        driverAvailability: {
          some: {
            date: {
              gte: new Date(`${formattedDate}T00:00:00Z`),
              lt: new Date(`${formattedDate}T23:59:59Z`),
            },
            isAvailable: true,
          },
        },
        NOT: {
          services: {
            some: {
              scheduledTime: {
                gte: new Date(`${formattedDate}T00:00:00Z`),
                lt: new Date(`${formattedDate}T23:59:59Z`),
              },
              status: {
                in: ["SCHEDULED", "DRIVER_ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"],
              },
              serviceType: {
                category: "DAY_BOOKING",
              },
            },
          },
        },
      },
      include: {
        driverDistricts: {
          where: {
            districtId: data.districtId,
          },
        },
      },
    });

    if (!driver) {
      return res.status(400).json({ error: "Driver not available for this date and district" });
    }

    // Get the service type for day booking
    const serviceType = await prisma.serviceType.findFirst({
      where: { category: "DAY_BOOKING" },
    });

    if (!serviceType) {
      return res.status(400).json({ error: "Day booking service type not found" });
    }

    // Geocode pickup address
    const pickupGeo = await geocodingClient.forwardGeocode({ query: data.pickupAddress }).send();
    const pickupFeature = pickupGeo.body.features[0];
    if (!pickupFeature) {
      return res.status(400).json({ error: "Invalid pickup address" });
    }

    // Create pickup location
    const pickupLocation = await prisma.location.create({
      data: {
        latitude: pickupFeature.center[1],
        longitude: pickupFeature.center[0],
        address: pickupFeature.place_name,
        city: pickupFeature.context.find((c: any) => c.id.includes("place"))?.text || "",
        country: pickupFeature.context.find((c: any) => c.id.includes("country"))?.text || "",
        placeId: pickupFeature.id,
      },
    });

    // Get price from driver district or default
    const price = driver.driverDistricts[0]?.customPrice || driver.dayBookingPrice!;

    // Calculate platform fee based on commission rate
    const platformFee = price * serviceType.commissionRate;

    // Create service
    const service = await prisma.service.create({
      data: {
        userId,
        serviceTypeId: serviceType.id,
        driverId: driver.id,
        status: "SCHEDULED",
        pickupLocationId: pickupLocation.id,
        districtId: data.districtId,
        scheduledTime: bookingDate,
        notes: data.notes,
        estimatedPrice: price,
        startTime: new Date(`${formattedDate}T09:00:00Z`), // Default 9 AM
        endTime: new Date(`${formattedDate}T17:00:00Z`), // Default 5 PM
      },
      include: {
        pickupLocation: true,
        district: true,
        serviceType: true,
        driver: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
            vehicle: true,
          },
        },
      },
    });

    // Create payment with platformFee
    await prisma.payment.create({
      data: {
        serviceId: service.id,
        userId,
        amount: price,
        platformFee, // Add the calculated platform fee
        paymentMethod: "CASH",
        status: "PENDING",
        driverEarnings: price - platformFee, // Calculate driver earnings
      },
    });

    // Create commission record
    await prisma.commission.create({
      data: {
        serviceId: service.id,
        platformFee,
        driverEarnings: price - platformFee,
      },
    });

    // Create notification for driver
    await prisma.notification.create({
      data: {
        userId: driver.userId,
        title: "New Day Booking",
        body: `You have a new day booking for ${formattedDate}`,
        type: "SERVICE_UPDATE",
        data: JSON.stringify({ serviceId: service.id }),
      },
    });

    // Emit socket event
    (req as any).io.to(`driver:${driver.id}`).emit("service:day_booking", {
      serviceId: service.id,
      date: formattedDate,
      district: service.district?.name || "Unknown",
    });

    res.status(201).json(service);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Get booking history
export const getBookingHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const isDriver = req.query.driver === "true"

    let services

    if (isDriver) {
      const driver = await prisma.driverProfile.findUnique({
        where: { userId },
      })

      if (!driver) {
        return res.status(404).json({ error: "Driver profile not found" })
      }

      services = await prisma.service.findMany({
        where: {
          driverId: driver.id,
          serviceType: {
            category: "DAY_BOOKING",
          },
        },
        include: {
          pickupLocation: true,
          district: true,
          serviceType: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              profileImage: true,
            },
          },
          payment: true,
        },
        orderBy: { scheduledTime: "desc" },
      })
    } else {
      services = await prisma.service.findMany({
        where: {
          userId,
          serviceType: {
            category: "DAY_BOOKING",
          },
        },
        include: {
          pickupLocation: true,
          district: true,
          serviceType: true,
          driver: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
              vehicle: true,
            },
          },
          payment: true,
        },
        orderBy: { scheduledTime: "desc" },
      })
    }

    res.json(services)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
