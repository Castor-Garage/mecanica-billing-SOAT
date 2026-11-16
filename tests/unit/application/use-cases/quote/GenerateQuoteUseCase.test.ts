import { describe, it, expect, vi } from 'vitest'
import { GenerateQuoteUseCase } from '../../../../../src/application/use-cases/quote/GenerateQuoteUseCase.js'
import { QuoteStatus } from '../../../../../src/domain/quote/value-objects/QuoteStatus.js'
import type { IQuoteRepository, QuoteRecord } from '../../../../../src/domain/quote/repositories/IQuoteRepository.js'
import type { IMessageBus } from '../../../../../src/domain/shared/messaging/IMessageBus.js'
import { BusinessRuleError } from '../../../../../src/shared/errors/AppError.js'

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

describe('GenerateQuoteUseCase', () => {
  it('sums item totals and creates a quote', async () => {
    const created = makeQuoteRecord({ totalAmount: 350 })
    const quoteRepo: IQuoteRepository = {
      create: vi.fn().mockResolvedValue(created),
      findById: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new GenerateQuoteUseCase(quoteRepo, bus)

    const result = await useCase.execute({
      type: 'GerarOrcamento',
      serviceOrderId: 'os-1',
      items: [
        { description: 'Troca de óleo', quantity: 1, unitPrice: 150 },
        { description: 'Filtro de ar', quantity: 2, unitPrice: 100 },
      ],
    })

    expect(quoteRepo.create).toHaveBeenCalledWith({ serviceOrderId: 'os-1', totalAmount: 350 })
    expect(result).toBe(created)
  })

  it('publishes OrcamentoGerado after creating the quote', async () => {
    const created = makeQuoteRecord()
    const quoteRepo: IQuoteRepository = {
      create: vi.fn().mockResolvedValue(created),
      findById: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new GenerateQuoteUseCase(quoteRepo, bus)

    await useCase.execute({
      type: 'GerarOrcamento',
      serviceOrderId: 'os-1',
      items: [{ description: 'Revisão', quantity: 1, unitPrice: 250 }],
    })

    expect(bus.publish).toHaveBeenCalledWith('os-events', {
      type: 'OrcamentoGerado',
      serviceOrderId: created.serviceOrderId,
      quoteId: created.id,
      totalAmount: created.totalAmount,
    })
  })

  it('rejects a command with no items', async () => {
    const quoteRepo: IQuoteRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
    }
    const bus: IMessageBus = { publish: vi.fn(), subscribe: vi.fn() }
    const useCase = new GenerateQuoteUseCase(quoteRepo, bus)

    await expect(
      useCase.execute({ type: 'GerarOrcamento', serviceOrderId: 'os-1', items: [] }),
    ).rejects.toThrow(BusinessRuleError)
    expect(quoteRepo.create).not.toHaveBeenCalled()
  })
})
