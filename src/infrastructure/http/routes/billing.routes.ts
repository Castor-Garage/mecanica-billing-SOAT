import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { type ZodTypeProvider } from 'fastify-type-provider-zod'
import { PrismaQuoteRepository } from '../../database/repositories/PrismaQuoteRepository.js'
import { PrismaPaymentRepository } from '../../database/repositories/PrismaPaymentRepository.js'
import { NotFoundError } from '../../../shared/errors/AppError.js'

const quoteSchema = z.object({
  id: z.string(),
  serviceOrderId: z.string(),
  totalAmount: z.number(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
})

const paymentSchema = z.object({
  id: z.string(),
  quoteId: z.string(),
  serviceOrderId: z.string(),
  provider: z.string(),
  providerPaymentId: z.string().nullable(),
  checkoutUrl: z.string().nullable(),
  amount: z.number(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  confirmedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  failureReason: z.string().nullable(),
})

export async function billingRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>()
  const quoteRepo = new PrismaQuoteRepository()
  const paymentRepo = new PrismaPaymentRepository()

  typed.get(
    '/quotes/:id',
    {
      schema: {
        tags: ['Quotes'],
        summary: 'Busca orçamento por ID',
        params: z.object({ id: z.string().uuid() }),
        response: { 200: quoteSchema },
      },
    },
    async (request) => {
      const quote = await quoteRepo.findById(request.params.id)
      if (!quote) throw new NotFoundError('Orçamento', request.params.id)
      return { ...quote, createdAt: quote.createdAt.toISOString(), updatedAt: quote.updatedAt.toISOString(), approvedAt: quote.approvedAt?.toISOString() ?? null, rejectedAt: quote.rejectedAt?.toISOString() ?? null }
    },
  )

  typed.get(
    '/payments/:id',
    {
      schema: {
        tags: ['Payments'],
        summary: 'Busca pagamento por ID',
        params: z.object({ id: z.string().uuid() }),
        response: { 200: paymentSchema },
      },
    },
    async (request) => {
      const payment = await paymentRepo.findById(request.params.id)
      if (!payment) throw new NotFoundError('Pagamento', request.params.id)
      return { ...payment, createdAt: payment.createdAt.toISOString(), updatedAt: payment.updatedAt.toISOString(), confirmedAt: payment.confirmedAt?.toISOString() ?? null, failedAt: payment.failedAt?.toISOString() ?? null }
    },
  )
}
