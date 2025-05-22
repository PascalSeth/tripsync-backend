//Payment Controller
import { prisma } from "../../config/prisma"
import { z } from "zod"
import axios from "axios"
import type { Request, Response } from "express"
import { env } from "../../config/env"
import { PaymentMethod } from "@prisma/client"

export const initializePaymentSchema = z.object({
  serviceId: z.string().uuid(),
  amount: z.number().positive(),
  email: z.string().email(),
})

export const initializePayment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.userId
    const data = initializePaymentSchema.parse(req.body)

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId, userId },
    })
    if (!service) {
      return res.status(404).json({ error: "Service not found" })
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: data.email,
        amount: data.amount * 100, // Paystack uses kobo
        callback_url: env.PAYSTACK_CALLBACK_URL,
        metadata: { serviceId: data.serviceId },
      },
      {
        headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
      },
    )

    const payment = await prisma.payment.update({
      where: { serviceId: data.serviceId },
      data: {
        transactionId: response.data.data.reference,
        amount: data.amount,
        paymentMethod: PaymentMethod.DEBIT_CARD,
      },
    })

    res.json({ authorizationUrl: response.data.data.authorization_url, payment })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { reference } = req.body

    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    })

    if (response.data.data.status === "success") {
      const payment = await prisma.payment.update({
        where: { transactionId: reference },
        data: { status: "PAID", paymentDate: new Date() },
      })

      await prisma.service.update({
        where: { id: payment.serviceId },
        data: { finalPrice: payment.amount },
      })

      res.json({ message: "Payment verified", payment })
    } else {
      res.status(400).json({ error: "Payment failed" })
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
}
