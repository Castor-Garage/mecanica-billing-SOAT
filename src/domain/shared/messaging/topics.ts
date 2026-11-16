// Contrato de mensageria do Billing Service - nomes de fila e formato das
// mensagens trocadas com o OS Service (ver ADR 0006). O OS Service mantem a
// definicao espelhada do lado dele; qualquer mudanca de formato aqui precisa
// ser coordenada com o repositorio mecanica-pos-SOAT.

export const BILLING_COMMANDS_QUEUE = 'billing-commands'
export const OS_EVENTS_QUEUE = 'os-events'

export interface QuoteItemInput {
  description: string
  quantity: number
  unitPrice: number
}

export interface GerarOrcamentoCommand {
  type: 'GerarOrcamento'
  serviceOrderId: string
  items: QuoteItemInput[]
}

export interface AprovarOrcamentoCommand {
  type: 'AprovarOrcamento'
  quoteId: string
}

export interface RejeitarOrcamentoCommand {
  type: 'RejeitarOrcamento'
  quoteId: string
}

export type BillingCommand =
  | GerarOrcamentoCommand
  | AprovarOrcamentoCommand
  | RejeitarOrcamentoCommand

export interface OrcamentoGeradoEvent {
  type: 'OrcamentoGerado'
  serviceOrderId: string
  quoteId: string
  totalAmount: number
}

export interface OrcamentoRejeitadoEvent {
  type: 'OrcamentoRejeitado'
  serviceOrderId: string
  quoteId: string
}

export interface PagamentoPendenteEvent {
  type: 'PagamentoPendente'
  serviceOrderId: string
  quoteId: string
  paymentId: string
  checkoutUrl: string
}

export interface PagamentoConfirmadoEvent {
  type: 'PagamentoConfirmado'
  serviceOrderId: string
  quoteId: string
  paymentId: string
}

export interface PagamentoFalhouEvent {
  type: 'PagamentoFalhou'
  serviceOrderId: string
  quoteId: string
  paymentId: string
  reason: string
}

export type BillingEvent =
  | OrcamentoGeradoEvent
  | OrcamentoRejeitadoEvent
  | PagamentoPendenteEvent
  | PagamentoConfirmadoEvent
  | PagamentoFalhouEvent
