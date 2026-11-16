import { describe, it, expect, vi } from 'vitest'
import { FailPaymentUseCase } from '../../../../../src/application/use-cases/payment/FailPaymentUseCase.js'
import { PaymentStatus } from '../../../../../src/domain/payment/value-objects/PaymentStatus.js'
import type { IPaymentRepository, PaymentRecord } from '../../../../../src/domain/payment/repositories/IPaymentRepository.js'
import type { IMessageBus } from '../../../../../src/domain/shared/messaging/IMessageBus.js'
import { NotFoundError, BusinessRuleError } from '../../../../../src/shared/errors/AppError.js'

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

describe('FailPaymentUseCase', () => {
  it('fails a pending payment and publishes PagamentoFalhou', async () => {
    const pending = makePaymentRecord()
    const failed = makePaymentRecord({
      status: PaymentStatus.FALHOU,
      providerPaymentId: 'mp-123',
      failedAt: new Date(),
      failureReason: 'Pagamento rejeitado pelo Mercado Pago',
    })
    const paymentRepo: IPaymentRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(pending),
      confirm: vi.fn(),
      fail: vi.fn().mockResolvedValue(failed),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new FailPaymentUseCase(paymentRepo, bus)

    const result = await useCase.execute(
      'payment-1',
      'mp-123',
      'Pagamento rejeitado pelo Mercado Pago',
    )

    expect(paymentRepo.fail).toHaveBeenCalledWith(
      'payment-1',
      'mp-123',
      'Pagamento rejeitado pelo Mercado Pago',
    )
    expect(bus.publish).toHaveBeenCalledWith('os-events', {
      type: 'PagamentoFalhou',
      serviceOrderId: failed.serviceOrderId,
      quoteId: failed.quoteId,
      paymentId: failed.id,
      reason: 'Pagamento rejeitado pelo Mercado Pago',
    })
    expect(result).toBe(failed)
  })

  it('throws NotFoundError when the payment does not exist', async () => {
    const paymentRepo: IPaymentRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      confirm: vi.fn(),
      fail: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new FailPaymentUseCase(paymentRepo, bus)

    await expect(useCase.execute('missing', 'mp-123', 'erro')).rejects.toThrow(NotFoundError)
  })

  it('throws BusinessRuleError when the payment is not pending', async () => {
    const confirmed = makePaymentRecord({ status: PaymentStatus.CONFIRMADO, confirmedAt: new Date() })
    const paymentRepo: IPaymentRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(confirmed),
      confirm: vi.fn(),
      fail: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new FailPaymentUseCase(paymentRepo, bus)

    await expect(useCase.execute('payment-1', 'mp-123', 'erro')).rejects.toThrow(BusinessRuleError)
    expect(paymentRepo.fail).not.toHaveBeenCalled()
  })
})
