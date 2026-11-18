import type { IPaymentRepository, PaymentRecord } from '../../../domain/payment/repositories/IPaymentRepository.js'
import { PaymentStatus, assertTransition } from '../../../domain/payment/value-objects/PaymentStatus.js'
import type { IMessageBus } from '../../../domain/shared/messaging/IMessageBus.js'
import {
  OS_EVENTS_QUEUE,
  type PagamentoConfirmadoEvent,
} from '../../../domain/shared/messaging/topics.js'
import { NotFoundError } from '../../../shared/errors/AppError.js'

const OS_SERVICE_URL = process.env.OS_SERVICE_URL ?? 'http://localhost:3001'

// Acionado pelo webhook do Stripe quando o pagamento e aprovado.
export class ConfirmPaymentUseCase {
  constructor(
    private readonly paymentRepo: IPaymentRepository,
    private readonly bus: IMessageBus,
  ) {}

  async execute(paymentId: string, providerPaymentId: string): Promise<PaymentRecord> {
    const payment = await this.paymentRepo.findById(paymentId)
    if (!payment) {
      throw new NotFoundError('Pagamento', paymentId)
    }

    assertTransition(payment.status, PaymentStatus.CONFIRMADO)

    const confirmed = await this.paymentRepo.confirm(paymentId, providerPaymentId)

    await this.bus.publish<PagamentoConfirmadoEvent>(OS_EVENTS_QUEUE, {
      type: 'PagamentoConfirmado',
      serviceOrderId: confirmed.serviceOrderId,
      quoteId: confirmed.quoteId,
      paymentId: confirmed.id,
    })

    // Notifica o OS service diretamente (fallback para ambiente sem SQS)
    await fetch(`${OS_SERVICE_URL}/internal/payment-confirmed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceOrderId: confirmed.serviceOrderId }),
    }).catch(() => { /* não bloqueia se OS service estiver indisponível */ })

    return confirmed
  }
}
