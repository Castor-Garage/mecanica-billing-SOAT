import { describe, it, expect, vi } from 'vitest'
import { ConfirmPaymentUseCase } from '../../../../../src/application/use-cases/payment/ConfirmPaymentUseCase.js'
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

describe('ConfirmPaymentUseCase', () => {
  it('confirms a pending payment and publishes PagamentoConfirmado', async () => {
    const pending = makePaymentRecord()
    const confirmed = makePaymentRecord({
      status: PaymentStatus.CONFIRMADO,
      providerPaymentId: 'mp-123',
      confirmedAt: new Date(),
    })
    const paymentRepo: IPaymentRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(pending),
      confirm: vi.fn().mockResolvedValue(confirmed),
      fail: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new ConfirmPaymentUseCase(paymentRepo, bus)

    const result = await useCase.execute('payment-1', 'mp-123')

    expect(paymentRepo.confirm).toHaveBeenCalledWith('payment-1', 'mp-123')
    expect(bus.publish).toHaveBeenCalledWith('os-events', {
      type: 'PagamentoConfirmado',
      serviceOrderId: confirmed.serviceOrderId,
      quoteId: confirmed.quoteId,
      paymentId: confirmed.id,
    })
    expect(result).toBe(confirmed)
  })

  it('throws NotFoundError when the payment does not exist', async () => {
    const paymentRepo: IPaymentRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      confirm: vi.fn(),
      fail: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new ConfirmPaymentUseCase(paymentRepo, bus)

    await expect(useCase.execute('missing', 'mp-123')).rejects.toThrow(NotFoundError)
  })

  it('throws BusinessRuleError when the payment is not pending', async () => {
    const failed = makePaymentRecord({ status: PaymentStatus.FALHOU, failedAt: new Date() })
    const paymentRepo: IPaymentRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(failed),
      confirm: vi.fn(),
      fail: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new ConfirmPaymentUseCase(paymentRepo, bus)

    await expect(useCase.execute('payment-1', 'mp-123')).rejects.toThrow(BusinessRuleError)
    expect(paymentRepo.confirm).not.toHaveBeenCalled()
  })
})
