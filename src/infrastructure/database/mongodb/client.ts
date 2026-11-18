import { MongoClient } from 'mongodb'

let client: MongoClient | null = null

export function getMongoClient(): MongoClient {
  if (!client) {
    const uri = process.env.NOSQL_CONNECTION_STRING
    if (!uri) {
      throw new Error('NOSQL_CONNECTION_STRING não configurado')
    }
    client = new MongoClient(uri)
  }
  return client
}

export async function closeMongoClient(): Promise<void> {
  if (client) {
    await client.close()
    client = null
  }
}
