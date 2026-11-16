import type { IQuoteRepository, QuoteRecord } from '../../../domain/quote/repositories/IQuoteRepository.js'
import { QuoteStatus, assertTransition } from '../../../domain/quote/value-objects/QuoteStatus.js'
import type { IMessageBus } from '../../../domain/shared/messaging/IMessageBus.js'
import {
  OS_EVENTS_QUEUE,
  type OrcamentoRejeitadoEvent,
} from '../../../domain/shared/messaging/topics.js'
import { NotFoundError } from '../../../shared/errors/AppError.js'

// Reage ao comando RejeitarOrcamento (fila billing-commands - ver ADR 0006),
// enviado pelo OS Service quando o cliente rejeita o orcamento.
export class RejectQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly bus: IMessageBus,
  ) {}

  async execute(quoteId: string): Promise<QuoteRecord> {
    const quote = await this.quoteRepo.findById(quoteId)
    if (!quote) {
      throw new NotFoundError('Orçamento', quoteId)
    }

    assertTransition(quote.status, QuoteStatus.REJEITADO)

    const rejected = await this.quoteRepo.reject(quoteId)

    await this.bus.publish<OrcamentoRejeitadoEvent>(OS_EVENTS_QUEUE, {
      type: 'OrcamentoRejeitado',
      serviceOrderId: rejected.serviceOrderId,
      quoteId: rejected.id,
    })

    return rejected
  }
}
