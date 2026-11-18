import { InMemoryMessageBus } from './InMemoryMessageBus.js'
import { SqsMessageBus } from './SqsMessageBus.js'
import type { IMessageBus } from '../../domain/shared/messaging/IMessageBus.js'

// Instancia unica do processo - o consumer de billing-commands
// (bootstrapConsumers.ts) e a rota de webhook publicam/consomem na mesma
// instancia. MESSAGE_BUS_DRIVER=sqs liga no Amazon SQS (ou LocalStack via
// SQS_ENDPOINT); sem a variavel, usa o adapter em memoria (testes/dev).
export const messageBus: IMessageBus =
  process.env.MESSAGE_BUS_DRIVER === 'sqs' ? new SqsMessageBus() : new InMemoryMessageBus()
