// config/prisma.ts
import { PrismaClient } from '@prisma/client'

declare global {
  var __prisma: PrismaClient | undefined
}

const prisma = global.__prisma || new PrismaClient({
  log: ['query', 'error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

// Add connection handling
prisma.$connect().catch((err) => {
  console.error('Failed to connect to database:', err)
})

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

export { prisma }