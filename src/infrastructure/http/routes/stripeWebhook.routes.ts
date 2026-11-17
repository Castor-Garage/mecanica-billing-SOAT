import Stripe from 'stripe'
import type { FastifyInstance } from 'fastify'
import { PrismaPaymentRepository } from '../../database/repositories/PrismaPaymentRepository.js'
import { MongoPaymentAttemptRepository } from '../../database/repositories/MongoPaymentAttemptRepository.js'
import { ConfirmPaymentUseCase } from '../../../application/use-cases/payment/ConfirmPaymentUseCase.js'
import { FailPaymentUseCase } from '../../../application/use-cases/payment/FailPaymentUseCase.js'
import { BusinessRuleError } from '../../../shared/errors/AppError.js'
import { messageBus } from '../../messaging/bus.js'

// Stripe exige o corpo raw (Buffer) para validar a assinatura com
// stripe.webhooks.constructEvent — o JSON.parse feito pelo Fastify invalida a
// verificação. O contentTypeParser abaixo intercepta application/json nesta
// rota antes que o parser global atue.
export async function stripeWebhookRoutes(app: FastifyInstance) {
  const paymentRepo = new PrismaPaymentRepository()
  const attemptRepo = new MongoPaymentAttemptRepository()
  const confirmPayment = new ConfirmPaymentUseCase(paymentRepo, messageBus)
  const failPayment = new FailPaymentUseCase(paymentRepo, messageBus)
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  )

  app.post('/webhooks/stripe', async (request, reply) => {
    const sig = request.headers['stripe-signature'] as string | undefined
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

    if (!sig) {
      return reply.status(400).send({ error: 'Missing stripe-signature header' })
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(request.body as Buffer, sig, secret)
    } catch (err) {
      request.log.warn({ err }, 'Stripe webhook signature inválida')
      return reply.status(400).send({ error: 'Invalid signature' })
    }

    const session = event.data.object as Stripe.Checkout.Session

    await attemptRepo
      .save({
        providerPaymentId: session.id,
        rawPayload: event as unknown as Record<string, unknown>,
        source: 'stripe',
      })
      .catch((err) => request.log.error({ err }, 'Falha ao salvar PaymentAttempt no MongoDB'))

    const paymentId = session.metadata?.paymentId
    if (!paymentId) {
      request.log.warn({ sessionId: session.id }, 'Webhook Stripe sem metadata.paymentId')
      return reply.status(200).send({ ok: true })
    }

    try {
      if (event.type === 'checkout.session.completed') {
        await confirmPayment.execute(paymentId, session.id)
      } else if (event.type === 'checkout.session.expired') {
        await failPayment.execute(paymentId, session.id, 'Sessão de checkout expirada')
      }
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        request.log.info({ sessionId: session.id }, 'Webhook Stripe já processado, ignorando')
      } else {
        throw err
      }
    }

    return reply.status(200).send({ ok: true })
  })
}
