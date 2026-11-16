import { MercadoPagoConfig, Payment, Preference } from 'mercadopago'
import type {
  CreatePreferenceInput,
  CreatePreferenceResult,
  IPaymentProvider,
  PaymentStatusResult,
} from '../../../domain/shared/providers/IPaymentProvider.js'
import { IntegrationError } from '../../../shared/errors/AppError.js'

// Adapter real do Mercado Pago (Checkout Pro - preferencia + webhook). Ainda
// nao testado contra a API de verdade por falta de access token de sandbox
// (ver README) - a forma das chamadas segue a documentacao oficial do SDK
// `mercadopago` v2.
export class MercadoPagoPaymentProvider implements IPaymentProvider {
  private readonly preferenceClient: Preference
  private readonly paymentClient: Payment

  constructor(accessToken: string = process.env.MERCADOPAGO_ACCESS_TOKEN ?? '') {
    const config = new MercadoPagoConfig({ accessToken })
    this.preferenceClient = new Preference(config)
    this.paymentClient = new Payment(config)
  }

  async createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult> {
    try {
      const response = await this.preferenceClient.create({
        body: {
          external_reference: input.externalReference,
          items: [
            {
              id: input.externalReference,
              title: input.description,
              quantity: 1,
              unit_price: input.amount,
            },
          ],
        },
      })

      if (!response.init_point) {
        throw new Error('Resposta do Mercado Pago sem init_point')
      }

      return { checkoutUrl: response.init_point }
    } catch (error) {
      throw new IntegrationError(
        'mercadopago',
        'Não foi possível criar a preferência de pagamento',
        error,
      )
    }
  }

  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    try {
      const response = await this.paymentClient.get({ id: providerPaymentId })

      if (!response.external_reference) {
        throw new Error('Resposta do Mercado Pago sem external_reference')
      }

      const status =
        response.status === 'approved'
          ? 'approved'
          : response.status === 'rejected' || response.status === 'cancelled'
            ? 'rejected'
            : 'pending'

      return { status, externalReference: response.external_reference }
    } catch (error) {
      throw new IntegrationError(
        'mercadopago',
        'Não foi possível consultar o status do pagamento',
        error,
      )
    }
  }
}
