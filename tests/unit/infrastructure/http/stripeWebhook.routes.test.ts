import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { BusinessRuleError } from '../../../../src/shared/errors/AppError.js'

const { mockConfirmExecute, mockFailExecute, mockAttemptSave, mockConstructEvent } = vi.hoisted(
  () => ({
    mockConfirmExecute: vi.fn(),
    mockFailExecute: vi.fn(),
    mockAttemptSave: vi.fn(),
    mockConstructEvent: vi.fn(),
  }),
)

vi.mock('../../../../src/infrastructure/database/repositories/PrismaPaymentRepository.js', () => ({
  PrismaPaymentRepository: class {
    findById = vi.fn()
    findByQuoteId = vi.fn()
    create = vi.fn()
    confirm = vi.fn()
    fail = vi.fn()
  },
}))

vi.mock(
  '../../../../src/infrastructure/database/repositories/MongoPaymentAttemptRepository.js',
  () => ({
    MongoPaymentAttemptRepository: class {
      save = mockAttemptSave
    },
  }),
)

vi.mock('../../../../src/application/use-cases/payment/ConfirmPaymentUseCase.js', () => ({
  ConfirmPaymentUseCase: class {
    execute = mockConfirmExecute
  },
}))

vi.mock('../../../../src/application/use-cases/payment/FailPaymentUseCase.js', () => ({
  FailPaymentUseCase: class {
    execute = mockFailExecute
  },
}))

vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent: mockConstructEvent }
  },
}))

vi.mock('../../../../src/infrastructure/messaging/bus.js', () => ({
  messageBus: { publish: vi.fn(), subscribe: vi.fn() },
}))

const PAYMENT_ID = '00000000-0000-0000-0000-000000000001'
const SESSION_ID = 'cs_test_abc123'
const VALID_SIG = 't=1700000000,v1=abc'

function makeEvent(type: string, paymentId: string | null = PAYMENT_ID) {
  return {
    type,
    data: {
      object: {
        id: SESSION_ID,
        metadata: paymentId ? { paymentId } : {},
      },
    },
  }
}

async function buildTestApp() {
  const { stripeWebhookRoutes } = await import(
    '../../../../src/infrastructure/http/routes/stripeWebhook.routes.js'
  )
  const app = Fastify({ logger: false })
  await app.register(stripeWebhookRoutes)
  return app
}

describe('POST /webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAttemptSave.mockResolvedValue(undefined)
  })

  it('returns 400 when stripe-signature header is missing', async () => {
    const app = await buildTestApp()

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload: Buffer.from('{}'),
      headers: { 'content-type': 'application/json' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'Missing stripe-signature header' })
  })

  it('returns 400 when stripe signature is invalid', async () => {
    const app = await buildTestApp()
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload')
    })

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload: Buffer.from('{}'),
      headers: { 'content-type': 'application/json', 'stripe-signature': 'bad-sig' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'Invalid signature' })
  })

  it('calls confirmPayment on checkout.session.completed', async () => {
    const app = await buildTestApp()
    mockConstructEvent.mockReturnValue(makeEvent('checkout.session.completed'))
    mockConfirmExecute.mockResolvedValue(undefined)

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload: Buffer.from('{}'),
      headers: { 'content-type': 'application/json', 'stripe-signature': VALID_SIG },
    })

    expect(res.statusCode).toBe(200)
    expect(mockConfirmExecute).toHaveBeenCalledWith(PAYMENT_ID, SESSION_ID)
    expect(mockFailExecute).not.toHaveBeenCalled()
  })

  it('calls failPayment on checkout.session.expired', async () => {
    const app = await buildTestApp()
    mockConstructEvent.mockReturnValue(makeEvent('checkout.session.expired'))
    mockFailExecute.mockResolvedValue(undefined)

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload: Buffer.from('{}'),
      headers: { 'content-type': 'application/json', 'stripe-signature': VALID_SIG },
    })

    expect(res.statusCode).toBe(200)
    expect(mockFailExecute).toHaveBeenCalledWith(PAYMENT_ID, SESSION_ID, 'Sessão de checkout expirada')
    expect(mockConfirmExecute).not.toHaveBeenCalled()
  })

  it('returns 200 and skips processing when metadata.paymentId is missing', async () => {
    const app = await buildTestApp()
    mockConstructEvent.mockReturnValue(makeEvent('checkout.session.completed', null))

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload: Buffer.from('{}'),
      headers: { 'content-type': 'application/json', 'stripe-signature': VALID_SIG },
    })

    expect(res.statusCode).toBe(200)
    expect(mockConfirmExecute).not.toHaveBeenCalled()
  })

  it('returns 200 on duplicate event (BusinessRuleError — idempotência)', async () => {
    const app = await buildTestApp()
    mockConstructEvent.mockReturnValue(makeEvent('checkout.session.completed'))
    mockConfirmExecute.mockRejectedValue(
      new BusinessRuleError('Pagamento já confirmado', 'INVALID_TRANSITION'),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload: Buffer.from('{}'),
      headers: { 'content-type': 'application/json', 'stripe-signature': VALID_SIG },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
  })

  it('saves PaymentAttempt in MongoDB for valid events', async () => {
    const app = await buildTestApp()
    mockConstructEvent.mockReturnValue(makeEvent('checkout.session.completed'))
    mockConfirmExecute.mockResolvedValue(undefined)

    await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      payload: Buffer.from('{}'),
      headers: { 'content-type': 'application/json', 'stripe-signature': VALID_SIG },
    })

    expect(mockAttemptSave).toHaveBeenCalledWith(
      expect.objectContaining({ providerPaymentId: SESSION_ID, source: 'stripe' }),
    )
  })
})
