import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { type ZodTypeProvider } from 'fastify-type-provider-zod'
import { PrismaPaymentRepository } from '../../database/repositories/PrismaPaymentRepository.js'
import { MercadoPagoPaymentProvider } from '../../providers/payment/MercadoPagoPaymentProvider.js'
import { ConfirmPaymentUseCase } from '../../../application/use-cases/payment/ConfirmPaymentUseCase.js'
import { FailPaymentUseCase } from '../../../application/use-cases/payment/FailPaymentUseCase.js'
import { messageBus } from '../../messaging/bus.js'
import { DynamoPaymentAttemptRepository } from '../../database/dynamodb/DynamoPaymentAttemptRepository.js'

// Webhook de notificacao de pagamento do Mercado Pago (Checkout Pro). O
// payload da notificacao so traz o id do pagamento - o status de verdade
// precisa ser consultado de volta na API (ver MercadoPagoPaymentProvider).
export async function webhookRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  const paymentRepo = new PrismaPaymentRepository()
  const paymentProvider = new MercadoPagoPaymentProvider()
  const confirmPayment = new ConfirmPaymentUseCase(paymentRepo, messageBus)
  const failPayment = new FailPaymentUseCase(paymentRepo, messageBus)
  // Banco NoSQL exigido pelo desafio (ver RFC 0004): grava o payload bruto de
  // toda notificacao recebida, antes de decidir confirmar/falhar o pagamento.
  const paymentAttemptRepo = new DynamoPaymentAttemptRepository()

  typed.post(
    '/webhooks/mercadopago',
    {
      schema: {
        tags: ['Webhooks'],
        summary: 'Notificação de pagamento do Mercado Pago',
        body: z.object({
          type: z.string().optional(),
          data: z.object({ id: z.string() }).optional(),
        }),
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      const { type, data } = request.body

      if (type !== 'payment' || !data?.id) {
        return reply.status(200).send({ ok: true })
      }

      const result = await paymentProvider.getPaymentStatus(data.id)

      await paymentAttemptRepo.record({
        paymentId: result.externalReference,
        providerPaymentId: data.id,
        status: result.status,
        rawPayload: request.body,
      })

      if (result.status === 'approved') {
        await confirmPayment.execute(result.externalReference, data.id)
      } else if (result.status === 'rejected') {
        await failPayment.execute(
          result.externalReference,
          data.id,
          'Pagamento rejeitado pelo Mercado Pago',
        )
      }

      return reply.status(200).send({ ok: true })
    },
  )
}
