import { InMemoryMessageBus } from './InMemoryMessageBus.js'
import type { IMessageBus } from '../../domain/shared/messaging/IMessageBus.js'

// Instancia unica do processo - o consumer de billing-commands (bootstrap.ts)
// e a rota de webhook publicam/consomem na mesma instancia. Troque por um
// adapter SQS real na Fase 5 mantendo este ponto de composicao unico.
export const messageBus: IMessageBus = new InMemoryMessageBus()
