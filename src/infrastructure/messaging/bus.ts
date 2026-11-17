import { InMemoryMessageBus } from './InMemoryMessageBus.js'
import { SqsMessageBus } from './SqsMessageBus.js'
import type { IMessageBus } from '../../domain/shared/messaging/IMessageBus.js'

// Ponto de composição único: SQS quando SQS_BILLING_COMMANDS_QUEUE_URL estiver
// configurado (staging/produção), InMemory caso contrário (dev local).
const useSqs = !!process.env.SQS_BILLING_COMMANDS_QUEUE_URL

export const messageBus: IMessageBus = useSqs ? new SqsMessageBus() : new InMemoryMessageBus()
