import type { Payment as PaymentModel } from '@prisma/client'
import { prisma } from '../prisma/client.js'
import type {
  CreatePaymentInput,
  IPaymentRepository,
  PaymentRecord,
} from '../../../domain/payment/repositories/IPaymentRepository.js'
import { PaymentStatus } from '../../../domain/payment/value-objects/PaymentStatus.js'

function toRecord(row: PaymentModel): PaymentRecord {
  return {
    id: row.id,
    quoteId: row.quoteId,
    serviceOrderId: row.serviceOrderId,
    provider: row.provider,
    providerPaymentId: row.providerPaymentId,
    checkoutUrl: row.checkoutUrl,
    amount: Number(row.amount),
    status: row.status as PaymentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    confirmedAt: row.confirmedAt,
    failedAt: row.failedAt,
    failureReason: row.failureReason,
  }
}

export class PrismaPaymentRepository implements IPaymentRepository {
  async create(input: CreatePaymentInput): Promise<PaymentRecord> {
    const row = await prisma.payment.create({
      data: {
        id: input.id,
        quoteId: input.quoteId,
        serviceOrderId: input.serviceOrderId,
        amount: input.amount,
        checkoutUrl: input.checkoutUrl,
      },
    })
    return toRecord(row)
  }

  async findById(id: string): Promise<PaymentRecord | null> {
    const row = await prisma.payment.findUnique({ where: { id } })
    return row ? toRecord(row) : null
  }

  async findByQuoteId(quoteId: string): Promise<PaymentRecord[]> {
    const rows = await prisma.payment.findMany({ where: { quoteId }, orderBy: { createdAt: 'desc' } })
    return rows.map(toRecord)
  }

  async confirm(id: string, providerPaymentId: string): Promise<PaymentRecord> {
    const row = await prisma.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.CONFIRMADO,
        providerPaymentId,
        confirmedAt: new Date(),
      },
    })
    return toRecord(row)
  }

  async fail(id: string, providerPaymentId: string, reason: string): Promise<PaymentRecord> {
    const row = await prisma.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.FALHOU,
        providerPaymentId,
        failedAt: new Date(),
        failureReason: reason,
      },
    })
    return toRecord(row)
  }
}
