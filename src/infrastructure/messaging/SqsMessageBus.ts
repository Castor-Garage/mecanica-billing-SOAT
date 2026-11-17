import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs'
import type { IMessageBus } from '../../domain/shared/messaging/IMessageBus.js'

type Handler = (message: unknown) => Promise<void>

// Adapter SQS para staging/producao. Publish envia para a fila pelo URL.
// Subscribe inicia um loop de long polling (20s) numa Promise que nao bloqueia
// o processo - erros sao logados e o loop recomeça apos 5s.
export class SqsMessageBus implements IMessageBus {
  private readonly client: SQSClient
  private readonly handlers = new Map<string, Handler[]>()

  constructor() {
    this.client = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
  }

  async publish<T>(queueUrl: string, message: T): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      }),
    )
  }

  subscribe<T>(queueUrl: string, handler: (message: T) => Promise<void>): void {
    const handlers = this.handlers.get(queueUrl) ?? []
    handlers.push(handler as Handler)
    this.handlers.set(queueUrl, handlers)

    // Inicia o loop de polling apenas uma vez por fila
    if (handlers.length === 1) {
      this.startPolling(queueUrl)
    }
  }

  private startPolling(queueUrl: string): void {
    const poll = async () => {
      while (true) {
        try {
          const response = await this.client.send(
            new ReceiveMessageCommand({
              QueueUrl: queueUrl,
              MaxNumberOfMessages: 10,
              WaitTimeSeconds: 20,
            }),
          )

          for (const msg of response.Messages ?? []) {
            const body = JSON.parse(msg.Body ?? '{}') as unknown
            const handlers = this.handlers.get(queueUrl) ?? []
            for (const handler of handlers) {
              await handler(body)
            }
            await this.client.send(
              new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: msg.ReceiptHandle,
              }),
            )
          }
        } catch {
          await new Promise((r) => setTimeout(r, 5000))
        }
      }
    }

    poll().catch(() => {})
  }
}
