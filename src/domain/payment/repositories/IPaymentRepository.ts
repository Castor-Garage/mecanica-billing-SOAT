import type { PaymentStatus } from '../value-objects/PaymentStatus.js'

export interface PaymentRecord {
  id: string
  quoteId: string
  serviceOrderId: string
  provider: string
  providerPaymentId: string | null
  checkoutUrl: string | null
  amount: number
  status: PaymentStatus
  createdAt: Date
  updatedAt: Date
  confirmedAt: Date | null
  failedAt: Date | null
  failureReason: string | null
}

export interface CreatePaymentInput {
  // gerado antes da chamada ao provedor, para usar como external_reference
  // (ver IPaymentProvider.createPreference)
  id: string
  quoteId: string
  serviceOrderId: string
  amount: number
  checkoutUrl: string
}

export interface IPaymentRepository {
  create(input: CreatePaymentInput): Promise<PaymentRecord>
  findById(id: string): Promise<PaymentRecord | null>
  confirm(id: string, providerPaymentId: string): Promise<PaymentRecord>
  fail(id: string, providerPaymentId: string, reason: string): Promise<PaymentRecord>
}
