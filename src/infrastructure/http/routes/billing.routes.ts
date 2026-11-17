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

function serializeQuote(q: import('../../../domain/quote/repositories/IQuoteRepository.js').QuoteRecord) {
  return {
    ...q,
    totalAmount: Number(q.totalAmount),
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    approvedAt: q.approvedAt?.toISOString() ?? null,
    rejectedAt: q.rejectedAt?.toISOString() ?? null,
  }
}

function serializePayment(p: import('../../../domain/payment/repositories/IPaymentRepository.js').PaymentRecord) {
  return {
    ...p,
    amount: Number(p.amount),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
    failedAt: p.failedAt?.toISOString() ?? null,
  }
}

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
      return serializeQuote(quote)
    },
  )

  typed.get(
    '/quotes',
    {
      schema: {
        tags: ['Quotes'],
        summary: 'Lista orçamentos por ordem de serviço',
        querystring: z.object({ serviceOrderId: z.string().uuid() }),
        response: { 200: z.array(quoteSchema) },
      },
    },
    async (request) => {
      const quotes = await quoteRepo.findByServiceOrderId(request.query.serviceOrderId)
      return quotes.map(serializeQuote)
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
      return serializePayment(payment)
    },
  )

  typed.get(
    '/payments',
    {
      schema: {
        tags: ['Payments'],
        summary: 'Lista pagamentos por orçamento',
        querystring: z.object({ quoteId: z.string().uuid() }),
        response: { 200: z.array(paymentSchema) },
      },
    },
    async (request) => {
      const payments = await paymentRepo.findByQuoteId(request.query.quoteId)
      return payments.map(serializePayment)
    },
  )
}
