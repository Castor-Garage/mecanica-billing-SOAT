import Stripe from 'stripe'
import type {
  CreatePreferenceInput,
  CreatePreferenceResult,
  IPaymentProvider,
  PaymentStatusResult,
} from '../../../domain/shared/providers/IPaymentProvider.js'
import { IntegrationError } from '../../../shared/errors/AppError.js'

export class StripePaymentProvider implements IPaymentProvider {
  private readonly stripe: Stripe

  constructor(secretKey: string = process.env.STRIPE_SECRET_KEY ?? '') {
    this.stripe = new Stripe(secretKey)
  }

  async createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000'

    try {
      const session = await this.stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'brl',
              product_data: { name: input.description },
              unit_amount: Math.round(input.amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${frontendUrl}/pagamento/sucesso?session_id={CHECKOUT_SESSION_ID}&os=${input.serviceOrderId}`,
        cancel_url: `${frontendUrl}/pagamento/cancelado`,
        metadata: { paymentId: input.externalReference },
      })

      if (!session.url) {
        throw new Error('Stripe não retornou session.url')
      }

      return { checkoutUrl: session.url }
    } catch (error) {
      throw new IntegrationError('stripe', 'Não foi possível criar a sessão de checkout', error)
    }
  }

  async getPaymentStatus(sessionId: string): Promise<PaymentStatusResult> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId)

      if (!session.metadata?.paymentId) {
        throw new Error('Sessão do Stripe sem metadata.paymentId')
      }

      const status =
        session.payment_status === 'paid'
          ? 'approved'
          : session.status === 'expired'
            ? 'rejected'
            : 'pending'

      return { status, externalReference: session.metadata.paymentId }
    } catch (error) {
      throw new IntegrationError('stripe', 'Não foi possível consultar o status da sessão', error)
    }
  }
}
