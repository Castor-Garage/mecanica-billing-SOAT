import { randomUUID } from 'node:crypto'
import type { IQuoteRepository } from '../../../domain/quote/repositories/IQuoteRepository.js'
import { QuoteStatus, assertTransition } from '../../../domain/quote/value-objects/QuoteStatus.js'
import type { IPaymentRepository, PaymentRecord } from '../../../domain/payment/repositories/IPaymentRepository.js'
import type { IPaymentProvider } from '../../../domain/shared/providers/IPaymentProvider.js'
import type { IMessageBus } from '../../../domain/shared/messaging/IMessageBus.js'
import {
  OS_EVENTS_QUEUE,
  type PagamentoPendenteEvent,
} from '../../../domain/shared/messaging/topics.js'
import { NotFoundError } from '../../../shared/errors/AppError.js'

// Reage ao comando AprovarOrcamento (fila billing-commands - ver ADR 0006).
// Alem de marcar o orcamento como aprovado, ja aciona a criacao da cobranca
// no Mercado Pago - sao duas etapas do mesmo gatilho de negocio (aprovar o
// orcamento sem cobranca nao faz sentido neste fluxo).
export class ApproveQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly paymentRepo: IPaymentRepository,
    private readonly paymentProvider: IPaymentProvider,
    private readonly bus: IMessageBus,
  ) {}

  async execute(quoteId: string): Promise<PaymentRecord> {
    const quote = await this.quoteRepo.findById(quoteId)
    if (!quote) {
      throw new NotFoundError('Orçamento', quoteId)
    }

    assertTransition(quote.status, QuoteStatus.APROVADO)

    const approved = await this.quoteRepo.approve(quoteId)
    const paymentId = randomUUID()

    const preference = await this.paymentProvider.createPreference({
      externalReference: paymentId,
      serviceOrderId: approved.serviceOrderId,
      description: `Orçamento da OS ${approved.serviceOrderId}`,
      amount: approved.totalAmount,
    })

    const payment = await this.paymentRepo.create({
      id: paymentId,
      quoteId: approved.id,
      serviceOrderId: approved.serviceOrderId,
      amount: approved.totalAmount,
      checkoutUrl: preference.checkoutUrl,
    })

    await this.bus.publish<PagamentoPendenteEvent>(OS_EVENTS_QUEUE, {
      type: 'PagamentoPendente',
      serviceOrderId: payment.serviceOrderId,
      quoteId: payment.quoteId,
      paymentId: payment.id,
      checkoutUrl: payment.checkoutUrl ?? '',
    })

    return payment
  }
}
