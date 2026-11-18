export interface PaymentAttemptInput {
  providerPaymentId: string
  rawPayload: Record<string, unknown>
  source: string
}

export interface PaymentAttempt extends PaymentAttemptInput {
  _id: string
  receivedAt: Date
}

export interface IPaymentAttemptRepository {
  save(input: PaymentAttemptInput): Promise<PaymentAttempt>
}
