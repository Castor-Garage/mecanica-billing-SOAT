// Porta do banco NoSQL exigido pelo desafio (ver RFC 0004 em
// mecanica-pos-SOAT/docs): guarda o payload bruto de cada notificacao de
// webhook do Mercado Pago, para auditoria/replay - nao e dado transacional
// (isso fica no Postgres, via IPaymentRepository). Schema flexivel por
// natureza (o payload do provedor muda entre eventos), por isso NoSQL.
export interface PaymentAttemptInput {
  paymentId: string
  providerPaymentId: string
  status: string
  rawPayload: unknown
}

export interface IPaymentAttemptRepository {
  record(attempt: PaymentAttemptInput): Promise<void>
}
