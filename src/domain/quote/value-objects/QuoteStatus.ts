import { BusinessRuleError } from '../../../shared/errors/AppError.js'

export enum QuoteStatus {
  PENDENTE = 'PENDENTE',
  APROVADO = 'APROVADO',
  REJEITADO = 'REJEITADO',
}

const VALID_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  [QuoteStatus.PENDENTE]: [QuoteStatus.APROVADO, QuoteStatus.REJEITADO],
  [QuoteStatus.APROVADO]: [],
  [QuoteStatus.REJEITADO]: [],
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  [QuoteStatus.PENDENTE]: 'Pendente',
  [QuoteStatus.APROVADO]: 'Aprovado',
  [QuoteStatus.REJEITADO]: 'Rejeitado',
}

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export function assertTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransition(from, to)) {
    throw new BusinessRuleError(
      `Transição inválida: "${STATUS_LABELS[from]}" → "${STATUS_LABELS[to]}". ` +
        `Próximos estados válidos: ${
          VALID_TRANSITIONS[from].map((s) => STATUS_LABELS[s]).join(', ') || 'nenhum (status terminal)'
        }`,
    )
  }
}

export function statusLabel(status: QuoteStatus): string {
  return STATUS_LABELS[status]
}
