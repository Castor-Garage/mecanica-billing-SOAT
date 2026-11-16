import { describe, it, expect, vi } from 'vitest'
import { RejectQuoteUseCase } from '../../../../../src/application/use-cases/quote/RejectQuoteUseCase.js'
import { QuoteStatus } from '../../../../../src/domain/quote/value-objects/QuoteStatus.js'
import type { IQuoteRepository, QuoteRecord } from '../../../../../src/domain/quote/repositories/IQuoteRepository.js'
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

describe('RejectQuoteUseCase', () => {
  it('rejects a pending quote and publishes OrcamentoRejeitado', async () => {
    const pending = makeQuoteRecord()
    const rejected = makeQuoteRecord({ status: QuoteStatus.REJEITADO, rejectedAt: new Date() })
    const quoteRepo: IQuoteRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(pending),
      approve: vi.fn(),
      reject: vi.fn().mockResolvedValue(rejected),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new RejectQuoteUseCase(quoteRepo, bus)

    const result = await useCase.execute('quote-1')

    expect(quoteRepo.reject).toHaveBeenCalledWith('quote-1')
    expect(bus.publish).toHaveBeenCalledWith('os-events', {
      type: 'OrcamentoRejeitado',
      serviceOrderId: rejected.serviceOrderId,
      quoteId: rejected.id,
    })
    expect(result).toBe(rejected)
  })

  it('throws NotFoundError when the quote does not exist', async () => {
    const quoteRepo: IQuoteRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      approve: vi.fn(),
      reject: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new RejectQuoteUseCase(quoteRepo, bus)

    await expect(useCase.execute('missing')).rejects.toThrow(NotFoundError)
  })

  it('throws BusinessRuleError when the quote is not pending', async () => {
    const approved = makeQuoteRecord({ status: QuoteStatus.APROVADO, approvedAt: new Date() })
    const quoteRepo: IQuoteRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(approved),
      approve: vi.fn(),
      reject: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new RejectQuoteUseCase(quoteRepo, bus)

    await expect(useCase.execute('quote-1')).rejects.toThrow(BusinessRuleError)
    expect(quoteRepo.reject).not.toHaveBeenCalled()
  })
})
