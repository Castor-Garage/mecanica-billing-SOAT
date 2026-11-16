import type { IPaymentRepository, PaymentRecord } from '../../../domain/payment/repositories/IPaymentRepository.js'
import { PaymentStatus, assertTransition } from '../../../domain/payment/value-objects/PaymentStatus.js'
import type { IMessageBus } from '../../../domain/shared/messaging/IMessageBus.js'
import {
  OS_EVENTS_QUEUE,
  type PagamentoFalhouEvent,
} from '../../../domain/shared/messaging/topics.js'
import { NotFoundError } from '../../../shared/errors/AppError.js'

// Acionado pelo webhook do Mercado Pago quando o pagamento e rejeitado - o
// OS Service recebe o evento e aplica a compensacao da saga (ver ADR 0006).
export class FailPaymentUseCase {
  constructor(
    private readonly paymentRepo: IPaymentRepository,
    private readonly bus: IMessageBus,
  ) {}

  async execute(paymentId: string, providerPaymentId: string, reason: string): Promise<PaymentRecord> {
    const payment = await this.paymentRepo.findById(paymentId)
    if (!payment) {
      throw new NotFoundError('Pagamento', paymentId)
    }

    assertTransition(payment.status, PaymentStatus.FALHOU)

    const failed = await this.paymentRepo.fail(paymentId, providerPaymentId, reason)

    await this.bus.publish<PagamentoFalhouEvent>(OS_EVENTS_QUEUE, {
      type: 'PagamentoFalhou',
      serviceOrderId: failed.serviceOrderId,
      quoteId: failed.quoteId,
      paymentId: failed.id,
      reason,
    })

    return failed
  }
}
