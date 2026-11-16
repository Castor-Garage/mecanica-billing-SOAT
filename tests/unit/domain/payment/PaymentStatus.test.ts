import { describe, it, expect } from 'vitest'
import { PaymentStatus, canTransition, assertTransition, statusLabel } from '../../../../src/domain/payment/value-objects/PaymentStatus.js'
import { BusinessRuleError } from '../../../../src/shared/errors/AppError.js'

describe('PaymentStatus transitions', () => {
  describe('canTransition', () => {
    it('allows PENDENTE to move to CONFIRMADO or FALHOU', () => {
      expect(canTransition(PaymentStatus.PENDENTE, PaymentStatus.CONFIRMADO)).toBe(true)
      expect(canTransition(PaymentStatus.PENDENTE, PaymentStatus.FALHOU)).toBe(true)
    })

    it('CONFIRMADO and FALHOU are terminal', () => {
      for (const status of Object.values(PaymentStatus)) {
        expect(canTransition(PaymentStatus.CONFIRMADO, status as PaymentStatus)).toBe(false)
        expect(canTransition(PaymentStatus.FALHOU, status as PaymentStatus)).toBe(false)
      }
    })
  })

  describe('assertTransition', () => {
    it('does not throw for a valid transition', () => {
      expect(() => assertTransition(PaymentStatus.PENDENTE, PaymentStatus.CONFIRMADO)).not.toThrow()
    })

    it('throws BusinessRuleError for an invalid transition', () => {
      expect(() => assertTransition(PaymentStatus.CONFIRMADO, PaymentStatus.FALHOU)).toThrow(
        BusinessRuleError,
      )
    })
  })

  describe('statusLabel', () => {
    it('returns the Portuguese label for each status', () => {
      expect(statusLabel(PaymentStatus.PENDENTE)).toBe('Pendente')
      expect(statusLabel(PaymentStatus.CONFIRMADO)).toBe('Confirmado')
      expect(statusLabel(PaymentStatus.FALHOU)).toBe('Falhou')
    })
  })
})
