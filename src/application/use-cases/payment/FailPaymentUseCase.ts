import type { IPaymentRepository, PaymentRecord } from '../../../domain/payment/repositories/IPaymentRepository.js'
import { PaymentStatus, assertTransition } from '../../../domain/payment/value-objects/PaymentStatus.js'
import type { IMessageBus } from '../../../domain/shared/messaging/IMessageBus.js'
import {
  OS_EVENTS_QUEUE,
  type PagamentoFalhouEvent,
} from '../../../domain/shared/messaging/topics.js'
import { NotFoundError } from '../../../shared/errors/AppError.js'

const OS_SERVICE_URL = process.env.OS_SERVICE_URL ?? 'http://localhost:3001'

// Acionado pelo webhook do Mercado Pago/Stripe quando o pagamento e
// rejeitado - o OS Service recebe o evento e aplica a compensacao da saga
// (ver ADR 0006).
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

    // Notifica o OS service diretamente (fallback para ambiente sem SQS) -
    // mesmo padrao do ConfirmPaymentUseCase.
    await fetch(`${OS_SERVICE_URL}/internal/payment-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceOrderId: failed.serviceOrderId, reason }),
    }).catch(() => { /* não bloqueia se OS service estiver indisponível */ })

    return failed
  }
}
