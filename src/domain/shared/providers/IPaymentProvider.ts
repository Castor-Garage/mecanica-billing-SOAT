export interface CreatePreferenceInput {
  // Nosso Payment.id, enviado como external_reference ao provedor para
  // conseguirmos correlacionar o pagamento de volta quando o webhook chegar.
  externalReference: string
  serviceOrderId: string
  description: string
  amount: number
}

export interface CreatePreferenceResult {
  checkoutUrl: string
}

export type PaymentProviderStatus = 'approved' | 'rejected' | 'pending'

export interface PaymentStatusResult {
  status: PaymentProviderStatus
  externalReference: string
}

// Porta para o gateway de pagamento (Mercado Pago - ver ADR 0006). O adapter
// concreto fica em infrastructure/providers/payment; os use cases dependem
// so desta interface.
export interface IPaymentProvider {
  createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult>
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>
}
