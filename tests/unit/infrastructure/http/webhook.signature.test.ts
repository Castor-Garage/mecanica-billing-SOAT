import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyMpSignature } from '../../../../src/infrastructure/http/routes/webhook.routes.js'

const SECRET = 'test-secret-123'

function buildSignature(dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')
  return `ts=${ts},v1=${v1}`
}

describe('verifyMpSignature', () => {
  it('returns true for a valid signature', () => {
    const dataId = 'pay-001'
    const requestId = 'req-abc'
    const ts = '1700000000'
    const xSignature = buildSignature(dataId, requestId, ts)
    expect(verifyMpSignature(dataId, xSignature, requestId, SECRET)).toBe(true)
  })

  it('returns false when v1 is tampered', () => {
    const xSignature = 'ts=1700000000,v1=deadbeefdeadbeef'
    expect(verifyMpSignature('pay-001', xSignature, 'req-abc', SECRET)).toBe(false)
  })

  it('returns false when header is malformed', () => {
    expect(verifyMpSignature('pay-001', 'not-valid-header', 'req-abc', SECRET)).toBe(false)
  })

  it('returns false when dataId differs from signed value', () => {
    const xSignature = buildSignature('pay-001', 'req-abc', '1700000000')
    expect(verifyMpSignature('pay-999', xSignature, 'req-abc', SECRET)).toBe(false)
  })

  it('returns false when requestId differs from signed value', () => {
    const xSignature = buildSignature('pay-001', 'req-abc', '1700000000')
    expect(verifyMpSignature('pay-001', xSignature, 'req-other', SECRET)).toBe(false)
  })

  it('returns false with wrong secret', () => {
    const xSignature = buildSignature('pay-001', 'req-abc', '1700000000')
    expect(verifyMpSignature('pay-001', xSignature, 'req-abc', 'wrong-secret')).toBe(false)
  })
})
