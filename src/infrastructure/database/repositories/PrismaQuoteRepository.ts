import type { Quote as QuoteModel } from '@prisma/client'
import { prisma } from '../prisma/client.js'
import type {
  CreateQuoteInput,
  IQuoteRepository,
  QuoteRecord,
} from '../../../domain/quote/repositories/IQuoteRepository.js'
import { QuoteStatus } from '../../../domain/quote/value-objects/QuoteStatus.js'

function toRecord(row: QuoteModel): QuoteRecord {
  return {
    id: row.id,
    serviceOrderId: row.serviceOrderId,
    totalAmount: Number(row.totalAmount),
    status: row.status as QuoteStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    approvedAt: row.approvedAt,
    rejectedAt: row.rejectedAt,
  }
}

export class PrismaQuoteRepository implements IQuoteRepository {
  async create(input: CreateQuoteInput): Promise<QuoteRecord> {
    const row = await prisma.quote.create({
      data: {
        serviceOrderId: input.serviceOrderId,
        totalAmount: input.totalAmount,
      },
    })
    return toRecord(row)
  }

  async findById(id: string): Promise<QuoteRecord | null> {
    const row = await prisma.quote.findUnique({ where: { id } })
    return row ? toRecord(row) : null
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<QuoteRecord[]> {
    const rows = await prisma.quote.findMany({ where: { serviceOrderId }, orderBy: { createdAt: 'desc' } })
    return rows.map(toRecord)
  }

  async approve(id: string): Promise<QuoteRecord> {
    const row = await prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.APROVADO, approvedAt: new Date() },
    })
    return toRecord(row)
  }

  async reject(id: string): Promise<QuoteRecord> {
    const row = await prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.REJEITADO, rejectedAt: new Date() },
    })
    return toRecord(row)
  }
}
