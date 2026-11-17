import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { type ZodTypeProvider } from 'fastify-type-provider-zod'
import { PrismaQuoteRepository } from '../../database/repositories/PrismaQuoteRepository.js'
import { PrismaPaymentRepository } from '../../database/repositories/PrismaPaymentRepository.js'
import { StripePaymentProvider } from '../../providers/payment/StripePaymentProvider.js'
import { GenerateQuoteUseCase } from '../../../application/use-cases/quote/GenerateQuoteUseCase.js'
import { ApproveQuoteUseCase } from '../../../application/use-cases/quote/ApproveQuoteUseCase.js'
import { messageBus } from '../../messaging/bus.js'

// Rota de debug local — permite simular o fluxo completo sem OS Service nem SQS.
// NÃO registrar em produção: só ativa quando NODE_ENV !== 'production'.
export async function debugRoutes(app: FastifyInstance) {
  if (process.env.NODE_ENV === 'production') return

  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.post(
    '/debug/checkout',
    {
      schema: {
        tags: ['Debug'],
        summary: '[DEBUG] Simula aprovação de orçamento e cria checkout Stripe',
        body: z.object({
          serviceOrderId: z.string().uuid().optional().default(() => randomUUID()),
          description: z.string().default('Serviço de manutenção'),
          amount: z.number().positive(),
        }),
        response: {
          200: z.object({
            serviceOrderId: z.string(),
            quoteId: z.string(),
            paymentId: z.string(),
            checkoutUrl: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const { serviceOrderId, description, amount } = request.body

      const quoteRepo = new PrismaQuoteRepository()
      const paymentRepo = new PrismaPaymentRepository()
      const paymentProvider = new StripePaymentProvider()

      const generateQuote = new GenerateQuoteUseCase(quoteRepo, messageBus)
      const approveQuote = new ApproveQuoteUseCase(quoteRepo, paymentRepo, paymentProvider, messageBus)

      const quote = await generateQuote.execute({
        type: 'GerarOrcamento',
        serviceOrderId,
        items: [{ description, quantity: 1, unitPrice: amount }],
      })

      const payment = await approveQuote.execute(quote.id)

      return {
        serviceOrderId,
        quoteId: quote.id,
        paymentId: payment.id,
        checkoutUrl: payment.checkoutUrl ?? '',
      }
    },
  )
}
