import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { type ZodTypeProvider } from 'fastify-type-provider-zod'
import { PrismaPaymentRepository } from '../../database/repositories/PrismaPaymentRepository.js'
import { MercadoPagoPaymentProvider } from '../../providers/payment/MercadoPagoPaymentProvider.js'
import { MongoPaymentAttemptRepository } from '../../database/repositories/MongoPaymentAttemptRepository.js'
import { ConfirmPaymentUseCase } from '../../../application/use-cases/payment/ConfirmPaymentUseCase.js'
import { FailPaymentUseCase } from '../../../application/use-cases/payment/FailPaymentUseCase.js'
import { BusinessRuleError } from '../../../shared/errors/AppError.js'
import { messageBus } from '../../messaging/bus.js'

// Verifica a assinatura HMAC-SHA256 que o Mercado Pago envia em x-signature.
// Formato do header: "ts=<timestamp>,v1=<hmac>"
// String assinada:   "id:{data.id};request-id:{x-request-id};ts:{ts};"
function verifyMpSignature(
  dataId: string,
  xSignature: string,
  xRequestId: string,
  secret: string,
): boolean {
  try {
    const parts = Object.fromEntries(xSignature.split(',').map((p) => p.split('=')))
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`
    const expected = createHmac('sha256', secret).update(manifest).digest('hex')
    return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 ?? ''))
  } catch {
    return false
  }
}

// Webhook de notificacao de pagamento do Mercado Pago (Checkout Pro). O
// payload da notificacao so traz o id do pagamento - o status de verdade
// precisa ser consultado de volta na API (ver MercadoPagoPaymentProvider).
export async function webhookRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  const paymentRepo = new PrismaPaymentRepository()
  const attemptRepo = new MongoPaymentAttemptRepository()
  const paymentProvider = new MercadoPagoPaymentProvider()
  const confirmPayment = new ConfirmPaymentUseCase(paymentRepo, messageBus)
  const failPayment = new FailPaymentUseCase(paymentRepo, messageBus)

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

      // Verificar assinatura quando o secret estiver configurado
      const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
      if (secret) {
        const xSignature = request.headers['x-signature'] as string | undefined
        const xRequestId = request.headers['x-request-id'] as string | undefined
        if (!xSignature || !xRequestId || !verifyMpSignature(data.id, xSignature, xRequestId, secret)) {
          request.log.warn({ dataId: data.id }, 'Webhook MP com assinatura inválida rejeitado')
          return reply.status(200).send({ ok: true })
        }
      }

      // Persiste o payload bruto no MongoDB antes de qualquer processamento
      await attemptRepo.save({
        providerPaymentId: data.id,
        rawPayload: request.body as Record<string, unknown>,
        source: 'mercadopago',
      }).catch((err) => request.log.error({ err }, 'Falha ao salvar PaymentAttempt no MongoDB'))

      try {
        const result = await paymentProvider.getPaymentStatus(data.id)

        if (result.status === 'approved') {
          await confirmPayment.execute(result.externalReference, data.id)
        } else if (result.status === 'rejected') {
          await failPayment.execute(
            result.externalReference,
            data.id,
            'Pagamento rejeitado pelo Mercado Pago',
          )
        }
      } catch (err) {
        // BusinessRuleError de transição inválida = evento já processado (idempotência)
        if (err instanceof BusinessRuleError) {
          request.log.info({ dataId: data.id }, 'Webhook MP já processado, ignorando')
        } else {
          throw err
        }
      }

      return reply.status(200).send({ ok: true })
    },
  )
}
