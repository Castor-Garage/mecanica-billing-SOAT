import type { IQuoteRepository, QuoteRecord } from '../../../domain/quote/repositories/IQuoteRepository.js'
import type { IMessageBus } from '../../../domain/shared/messaging/IMessageBus.js'
import {
  OS_EVENTS_QUEUE,
  type GerarOrcamentoCommand,
  type OrcamentoGeradoEvent,
} from '../../../domain/shared/messaging/topics.js'
import { BusinessRuleError } from '../../../shared/errors/AppError.js'

// Reage ao comando GerarOrcamento (fila billing-commands - ver ADR 0006). O
// OS Service ja resolve servico/peca via seu proprio catalogo antes de
// publicar o comando, entao aqui so somamos os itens recebidos.
export class GenerateQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly bus: IMessageBus,
  ) {}

  async execute(command: GerarOrcamentoCommand): Promise<QuoteRecord> {
    if (command.items.length === 0) {
      throw new BusinessRuleError('Não é possível gerar orçamento sem itens')
    }

    const totalAmount = command.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

    const quote = await this.quoteRepo.create({
      serviceOrderId: command.serviceOrderId,
      totalAmount,
    })

    await this.bus.publish<OrcamentoGeradoEvent>(OS_EVENTS_QUEUE, {
      type: 'OrcamentoGerado',
      serviceOrderId: quote.serviceOrderId,
      quoteId: quote.id,
      totalAmount: quote.totalAmount,
    })

    return quote
  }
}
