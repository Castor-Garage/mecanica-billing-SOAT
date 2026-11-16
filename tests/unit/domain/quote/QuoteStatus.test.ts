import { describe, it, expect } from 'vitest'
import { QuoteStatus, canTransition, assertTransition, statusLabel } from '../../../../src/domain/quote/value-objects/QuoteStatus.js'
import { BusinessRuleError } from '../../../../src/shared/errors/AppError.js'

describe('QuoteStatus transitions', () => {
  describe('canTransition', () => {
    it('allows PENDENTE to move to APROVADO or REJEITADO', () => {
      expect(canTransition(QuoteStatus.PENDENTE, QuoteStatus.APROVADO)).toBe(true)
      expect(canTransition(QuoteStatus.PENDENTE, QuoteStatus.REJEITADO)).toBe(true)
    })

    it('APROVADO and REJEITADO are terminal', () => {
      for (const status of Object.values(QuoteStatus)) {
        expect(canTransition(QuoteStatus.APROVADO, status as QuoteStatus)).toBe(false)
        expect(canTransition(QuoteStatus.REJEITADO, status as QuoteStatus)).toBe(false)
      }
    })
  })

  describe('assertTransition', () => {
    it('does not throw for a valid transition', () => {
      expect(() => assertTransition(QuoteStatus.PENDENTE, QuoteStatus.APROVADO)).not.toThrow()
    })

    it('throws BusinessRuleError for an invalid transition', () => {
      expect(() => assertTransition(QuoteStatus.APROVADO, QuoteStatus.REJEITADO)).toThrow(
        BusinessRuleError,
      )
    })

    it('error message mentions current and target status labels', () => {
      expect(() => assertTransition(QuoteStatus.APROVADO, QuoteStatus.REJEITADO)).toThrow(/Aprovado/)
    })
  })

  describe('statusLabel', () => {
    it('returns the Portuguese label for each status', () => {
      expect(statusLabel(QuoteStatus.PENDENTE)).toBe('Pendente')
      expect(statusLabel(QuoteStatus.APROVADO)).toBe('Aprovado')
      expect(statusLabel(QuoteStatus.REJEITADO)).toBe('Rejeitado')
    })
  })
})
