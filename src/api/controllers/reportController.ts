//reportController.ts
import { prisma } from "../../config/prisma"
import { z } from "zod"
import type { Request, Response } from "express"

// Schemas
export const updateReportStatusSchema = z.object({
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "RESOLVED", "DISMISSED", "ESCALATED"]),
  responseMessage: z.string().optional(),
})

// Report Management
export const getReports = async (req: Request, res: Response) => {
  try {
    const { status, type, driverId } = req.query

    const whereClause: any = {}

    if (status) {
      whereClause.status = status
    }

    if (type) {
      whereClause.reportType = type
    }

    if (driverId) {
      whereClause.reportedDriverId = driverId
    }

    const reports = await prisma.report.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        service: {
          include: {
            serviceType: true,
          },
        },
        reportedDriver: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        attachments: true,
      },
      orderBy: { createdAt: "desc" },
    })

    res.json(reports)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getReport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        service: {
          include: {
            serviceType: true,
            pickupLocation: true,
            dropoffLocation: true,
            driver: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        reportedDriver: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            vehicle: true,
          },
        },
        attachments: true,
      },
    })

    if (!report) {
      return res.status(404).json({ error: "Report not found" })
    }

    res.json(report)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const updateReportStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateReportStatusSchema.parse(req.body)

    // Check if report exists
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        user: true,
      },
    })

    if (!report) {
      return res.status(404).json({ error: "Report not found" })
    }

    // Update report status
    const updatedReport = await prisma.report.update({
      where: { id },
      data: {
        status: data.status,
        responseMessage: data.responseMessage,
        updatedAt: new Date(),
      },
    })

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId: report.userId,
        title: "Report Status Updated",
        body: `Your report has been updated to ${data.status}${data.responseMessage ? `: ${data.responseMessage}` : ""}`,
        type: "SYSTEM",
        data: JSON.stringify({ reportId: id }),
      },
    })

    res.json(updatedReport)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const getReportTypes = async (req: Request, res: Response) => {
  try {
    // Return all report types from enum
    const reportTypes = [
      "SAFETY_CONCERN",
      "INAPPROPRIATE_BEHAVIOR",
      "DRIVER_MISCONDUCT",
      "PAYMENT_ISSUE",
      "DELIVERY_ISSUE",
      "SERVICE_QUALITY",
      "VEHICLE_CONDITION",
      "OTHER",
    ]

    res.json(reportTypes)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
