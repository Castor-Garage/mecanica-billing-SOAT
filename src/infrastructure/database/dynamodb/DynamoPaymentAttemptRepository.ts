import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import type {
  IPaymentAttemptRepository,
  PaymentAttemptInput,
} from '../../../domain/payment/repositories/IPaymentAttemptRepository.js'

// Adapter do banco NoSQL (ver RFC 0004) - tabela provisionada em
// mecanica-db-infra-SOAT/dynamodb.tf. Chave primaria composta
// (paymentId + receivedAt) permite consultar todas as tentativas de um
// pagamento em ordem cronologica.
export class DynamoPaymentAttemptRepository implements IPaymentAttemptRepository {
  private readonly client: DynamoDBDocumentClient
  private readonly tableName: string

  constructor(tableName = process.env.PAYMENT_ATTEMPTS_TABLE_NAME ?? 'castor-garage-billing-payment-attempts') {
    this.tableName = tableName
    const base = new DynamoDBClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
    })
    this.client = DynamoDBDocumentClient.from(base)
  }

  async record(attempt: PaymentAttemptInput): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          paymentId: attempt.paymentId,
          receivedAt: new Date().toISOString(),
          id: randomUUID(),
          providerPaymentId: attempt.providerPaymentId,
          status: attempt.status,
          rawPayload: attempt.rawPayload,
        },
      }),
    )
  }
}
