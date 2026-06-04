import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  // Wallet settlement runs several writes in one interactive transaction; the
  // 5s default is too tight against a remote Supabase pooler (causes P2028).
  transactionOptions: { maxWait: 10_000, timeout: 20_000 },
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
