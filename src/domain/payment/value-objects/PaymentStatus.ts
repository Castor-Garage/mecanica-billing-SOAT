import { BusinessRuleError } from '../../../shared/errors/AppError.js'

export enum PaymentStatus {
  PENDENTE = 'PENDENTE',
  CONFIRMADO = 'CONFIRMADO',
  FALHOU = 'FALHOU',
}

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDENTE]: [PaymentStatus.CONFIRMADO, PaymentStatus.FALHOU],
  [PaymentStatus.CONFIRMADO]: [],
  [PaymentStatus.FALHOU]: [],
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDENTE]: 'Pendente',
  [PaymentStatus.CONFIRMADO]: 'Confirmado',
  [PaymentStatus.FALHOU]: 'Falhou',
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new BusinessRuleError(
      `Transição inválida: "${STATUS_LABELS[from]}" → "${STATUS_LABELS[to]}". ` +
        `Próximos estados válidos: ${
          VALID_TRANSITIONS[from].map((s) => STATUS_LABELS[s]).join(', ') || 'nenhum (status terminal)'
        }`,
    )
  }
}

export function statusLabel(status: PaymentStatus): string {
  return STATUS_LABELS[status]
}
