import { describe, it, expect, vi } from 'vitest'
import { ApproveQuoteUseCase } from '../../../../../src/application/use-cases/quote/ApproveQuoteUseCase.js'
import { QuoteStatus } from '../../../../../src/domain/quote/value-objects/QuoteStatus.js'
import { PaymentStatus } from '../../../../../src/domain/payment/value-objects/PaymentStatus.js'
import type { IQuoteRepository, QuoteRecord } from '../../../../../src/domain/quote/repositories/IQuoteRepository.js'
import type { IPaymentRepository, PaymentRecord } from '../../../../../src/domain/payment/repositories/IPaymentRepository.js'
import type { IPaymentProvider } from '../../../../../src/domain/shared/providers/IPaymentProvider.js'
import type { IMessageBus } from '../../../../../src/domain/shared/messaging/IMessageBus.js'
import { NotFoundError, BusinessRuleError } from '../../../../../src/shared/errors/AppError.js'

function makeQuoteRecord(overrides: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'quote-1',
    serviceOrderId: 'os-1',
    totalAmount: 250,
    status: QuoteStatus.PENDENTE,
    createdAt: new Date(),
    updatedAt: new Date(),
    approvedAt: null,
    rejectedAt: null,
    ...overrides,
  }
}

function makePaymentRecord(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'payment-1',
    quoteId: 'quote-1',
    serviceOrderId: 'os-1',
    provider: 'MERCADO_PAGO',
    providerPaymentId: null,
    checkoutUrl: 'https://mercadopago.test/checkout/payment-1',
    amount: 250,
    status: PaymentStatus.PENDENTE,
    createdAt: new Date(),
    updatedAt: new Date(),
    confirmedAt: null,
    failedAt: null,
    failureReason: null,
    ...overrides,
  }
}

describe('ApproveQuoteUseCase', () => {
  it('approves the quote, creates a payment preference and publishes PagamentoPendente', async () => {
    const pending = makeQuoteRecord()
    const approved = makeQuoteRecord({ status: QuoteStatus.APROVADO, approvedAt: new Date() })
    const payment = makePaymentRecord()

    const quoteRepo: IQuoteRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(pending),
      approve: vi.fn().mockResolvedValue(approved),
      reject: vi.fn(),
    }
    const paymentRepo: IPaymentRepository = {
      create: vi.fn().mockResolvedValue(payment),
      findById: vi.fn(),
      confirm: vi.fn(),
      fail: vi.fn(),
    }
    const paymentProvider: IPaymentProvider = {
      createPreference: vi.fn().mockResolvedValue({ checkoutUrl: payment.checkoutUrl }),
      getPaymentStatus: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }

    const useCase = new ApproveQuoteUseCase(quoteRepo, paymentRepo, paymentProvider, bus)
    const result = await useCase.execute('quote-1')

    expect(quoteRepo.approve).toHaveBeenCalledWith('quote-1')
    expect(paymentProvider.createPreference).toHaveBeenCalledWith(
      expect.objectContaining({ amount: approved.totalAmount }),
    )
    expect(paymentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: approved.id,
        serviceOrderId: approved.serviceOrderId,
        amount: approved.totalAmount,
        checkoutUrl: payment.checkoutUrl,
      }),
    )
    expect(bus.publish).toHaveBeenCalledWith('os-events', {
      type: 'PagamentoPendente',
      serviceOrderId: payment.serviceOrderId,
      quoteId: payment.quoteId,
      paymentId: payment.id,
      checkoutUrl: payment.checkoutUrl,
    })
    expect(result).toBe(payment)
  })

  it('throws NotFoundError when the quote does not exist', async () => {
    const quoteRepo: IQuoteRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      approve: vi.fn(),
      reject: vi.fn(),
    }
    const paymentRepo: IPaymentRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      confirm: vi.fn(),
      fail: vi.fn(),
    }
    const paymentProvider: IPaymentProvider = { createPreference: vi.fn(), getPaymentStatus: vi.fn() }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }

    const useCase = new ApproveQuoteUseCase(quoteRepo, paymentRepo, paymentProvider, bus)

    await expect(useCase.execute('missing')).rejects.toThrow(NotFoundError)
  })

  it('throws BusinessRuleError when the quote is not pending', async () => {
    const rejected = makeQuoteRecord({ status: QuoteStatus.REJEITADO, rejectedAt: new Date() })
    const quoteRepo: IQuoteRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(rejected),
      approve: vi.fn(),
      reject: vi.fn(),
    }
    const paymentRepo: IPaymentRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      confirm: vi.fn(),
      fail: vi.fn(),
    }
    const paymentProvider: IPaymentProvider = { createPreference: vi.fn(), getPaymentStatus: vi.fn() }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }

    const useCase = new ApproveQuoteUseCase(quoteRepo, paymentRepo, paymentProvider, bus)

    await expect(useCase.execute('quote-1')).rejects.toThrow(BusinessRuleError)
    expect(quoteRepo.approve).not.toHaveBeenCalled()
    expect(paymentProvider.createPreference).not.toHaveBeenCalled()
  })
})
