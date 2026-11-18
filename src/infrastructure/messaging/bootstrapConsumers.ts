import type { FastifyBaseLogger } from 'fastify'
import newrelic from 'newrelic'
import { messageBus } from './bus.js'
import { BILLING_COMMANDS_QUEUE, type BillingCommand } from '../../domain/shared/messaging/topics.js'
import { PrismaQuoteRepository } from '../database/repositories/PrismaQuoteRepository.js'
import { PrismaPaymentRepository } from '../database/repositories/PrismaPaymentRepository.js'
import { StripePaymentProvider } from '../providers/payment/StripePaymentProvider.js'
import { GenerateQuoteUseCase } from '../../application/use-cases/quote/GenerateQuoteUseCase.js'
import { ApproveQuoteUseCase } from '../../application/use-cases/quote/ApproveQuoteUseCase.js'
import { RejectQuoteUseCase } from '../../application/use-cases/quote/RejectQuoteUseCase.js'

// Liga o consumer do comando de billing-commands (ver ADR 0006) ao
// InMemoryMessageBus do processo. Na Fase 5 do backlog, o mesmo
// `messageBus.subscribe` passa a ser atendido por um adapter SQS real -
// nada aqui precisa mudar, so o adapter importado em bus.ts.
export function bootstrapBillingCommandsConsumer(log: FastifyBaseLogger): void {
  const quoteRepo = new PrismaQuoteRepository()
  const paymentRepo = new PrismaPaymentRepository()
  const paymentProvider = new StripePaymentProvider()

  const generateQuote = new GenerateQuoteUseCase(quoteRepo, messageBus)
  const approveQuote = new ApproveQuoteUseCase(quoteRepo, paymentRepo, paymentProvider, messageBus)
  const rejectQuote = new RejectQuoteUseCase(quoteRepo, messageBus)

  messageBus.subscribe<BillingCommand>(BILLING_COMMANDS_QUEUE, async (command) => {
    // Consumo de fila nao passa por uma transacao HTTP, entao o agente do
    // New Relic nao traca nada aqui por padrao - sem isso, cada comando
    // processado e invisivel no APM. startBackgroundTransaction cria uma
    // transacao propria por comando, com o tipo como atributo pesquisavel.
    await newrelic.startBackgroundTransaction(`saga/billing-commands/${command.type}`, async () => {
      const transaction = newrelic.getTransaction()
      newrelic.addCustomAttribute('commandType', command.type)
      try {
        switch (command.type) {
          case 'GerarOrcamento':
            newrelic.addCustomAttribute('serviceOrderId', command.serviceOrderId)
            await generateQuote.execute(command)
            break
          case 'AprovarOrcamento':
            newrelic.addCustomAttribute('quoteId', command.quoteId)
            await approveQuote.execute(command.quoteId)
            break
          case 'RejeitarOrcamento':
            newrelic.addCustomAttribute('quoteId', command.quoteId)
            await rejectQuote.execute(command.quoteId)
            break
        }
      } catch (error) {
        newrelic.noticeError(error as Error)
        log.error({ err: error, command }, 'Falha ao processar comando de billing')
      } finally {
        transaction.end()
      }
    })
  })
}
