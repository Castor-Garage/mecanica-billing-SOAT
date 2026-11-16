import type { QuoteStatus } from '../value-objects/QuoteStatus.js'

export interface QuoteRecord {
  id: string
  serviceOrderId: string
  totalAmount: number
  status: QuoteStatus
  createdAt: Date
  updatedAt: Date
  approvedAt: Date | null
  rejectedAt: Date | null
}

export interface CreateQuoteInput {
  serviceOrderId: string
  totalAmount: number
}

export interface IQuoteRepository {
  create(input: CreateQuoteInput): Promise<QuoteRecord>
  findById(id: string): Promise<QuoteRecord | null>
  approve(id: string): Promise<QuoteRecord>
  reject(id: string): Promise<QuoteRecord>
}
