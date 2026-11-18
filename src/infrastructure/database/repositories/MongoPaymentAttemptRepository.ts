import { randomUUID } from 'node:crypto'
import type {
  IPaymentAttemptRepository,
  PaymentAttempt,
  PaymentAttemptInput,
} from '../../../domain/payment/repositories/IPaymentAttemptRepository.js'
import { getMongoClient } from '../mongodb/client.js'

const DB_NAME = process.env.MONGO_DB_NAME ?? 'mecanica_billing'
const COLLECTION = 'payment_attempts'

export class MongoPaymentAttemptRepository implements IPaymentAttemptRepository {
  async save(input: PaymentAttemptInput): Promise<PaymentAttempt> {
    const client = getMongoClient()
    const col = client.db(DB_NAME).collection<PaymentAttempt>(COLLECTION)

    const doc: PaymentAttempt = {
      _id: randomUUID(),
      providerPaymentId: input.providerPaymentId,
      rawPayload: input.rawPayload,
      source: input.source,
      receivedAt: new Date(),
    }

    await col.insertOne(doc)
    return doc
  }
}
