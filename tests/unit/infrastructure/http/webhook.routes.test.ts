import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { BusinessRuleError } from '../../../../src/shared/errors/AppError.js'

const { mockGetPaymentStatus, mockConfirmExecute, mockFailExecute, mockAttemptSave } = vi.hoisted(() => ({
  mockGetPaymentStatus: vi.fn(),
  mockConfirmExecute: vi.fn(),
  mockFailExecute: vi.fn(),
  mockAttemptSave: vi.fn(),
}))

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

vi.mock('../../../../src/infrastructure/providers/payment/MercadoPagoPaymentProvider.js', () => ({
  MercadoPagoPaymentProvider: class {
    getPaymentStatus = mockGetPaymentStatus
    createPreference = vi.fn()
  },
}))

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

vi.mock('../../../../src/infrastructure/messaging/bus.js', () => ({
  messageBus: { publish: vi.fn(), subscribe: vi.fn() },
}))

const PAYMENT_ID = '00000000-0000-0000-0000-000000000002'
const PROVIDER_PAYMENT_ID = 'mp-payment-123'

async function buildTestApp() {
  const { webhookRoutes } = await import('../../../../src/infrastructure/http/routes/webhook.routes.js')
  const app = Fastify({ logger: false })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(webhookRoutes)
  return app
}

function postWebhook(app: Awaited<ReturnType<typeof buildTestApp>>, body: unknown, headers: Record<string, string> = {}) {
  return app.inject({ method: 'POST', url: '/webhooks/mercadopago', payload: body as object, headers })
}

describe('POST /webhooks/mercadopago', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAttemptSave.mockResolvedValue(undefined)
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET
  })

  afterEach(() => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET
  })

  it('returns 200 and skips processing when type is not "payment"', async () => {
    const app = await buildTestApp()

    const res = await postWebhook(app, { type: 'other', data: { id: PROVIDER_PAYMENT_ID } })

    expect(res.statusCode).toBe(200)
    expect(mockGetPaymentStatus).not.toHaveBeenCalled()
  })

  it('returns 200 and skips processing when data.id is missing', async () => {
    const app = await buildTestApp()

    const res = await postWebhook(app, { type: 'payment' })

    expect(res.statusCode).toBe(200)
    expect(mockGetPaymentStatus).not.toHaveBeenCalled()
  })

  it('confirms the payment when the provider reports it approved', async () => {
    const app = await buildTestApp()
    mockGetPaymentStatus.mockResolvedValue({ status: 'approved', externalReference: PAYMENT_ID })

    const res = await postWebhook(app, { type: 'payment', data: { id: PROVIDER_PAYMENT_ID } })

    expect(res.statusCode).toBe(200)
    expect(mockConfirmExecute).toHaveBeenCalledWith(PAYMENT_ID, PROVIDER_PAYMENT_ID)
    expect(mockFailExecute).not.toHaveBeenCalled()
  })

  it('fails the payment when the provider reports it rejected', async () => {
    const app = await buildTestApp()
    mockGetPaymentStatus.mockResolvedValue({ status: 'rejected', externalReference: PAYMENT_ID })

    const res = await postWebhook(app, { type: 'payment', data: { id: PROVIDER_PAYMENT_ID } })

    expect(res.statusCode).toBe(200)
    expect(mockFailExecute).toHaveBeenCalledWith(
      PAYMENT_ID,
      PROVIDER_PAYMENT_ID,
      'Pagamento rejeitado pelo Mercado Pago',
    )
    expect(mockConfirmExecute).not.toHaveBeenCalled()
  })

  it('does nothing when the provider reports a pending status', async () => {
    const app = await buildTestApp()
    mockGetPaymentStatus.mockResolvedValue({ status: 'pending', externalReference: PAYMENT_ID })

    const res = await postWebhook(app, { type: 'payment', data: { id: PROVIDER_PAYMENT_ID } })

    expect(res.statusCode).toBe(200)
    expect(mockConfirmExecute).not.toHaveBeenCalled()
    expect(mockFailExecute).not.toHaveBeenCalled()
  })

  it('returns 200 on duplicate event (BusinessRuleError — idempotência)', async () => {
    const app = await buildTestApp()
    mockGetPaymentStatus.mockResolvedValue({ status: 'approved', externalReference: PAYMENT_ID })
    mockConfirmExecute.mockRejectedValue(new BusinessRuleError('Pagamento já confirmado', 'INVALID_TRANSITION'))

    const res = await postWebhook(app, { type: 'payment', data: { id: PROVIDER_PAYMENT_ID } })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
  })

  it('saves the PaymentAttempt in MongoDB before processing', async () => {
    const app = await buildTestApp()
    mockGetPaymentStatus.mockResolvedValue({ status: 'approved', externalReference: PAYMENT_ID })

    await postWebhook(app, { type: 'payment', data: { id: PROVIDER_PAYMENT_ID } })

    expect(mockAttemptSave).toHaveBeenCalledWith(
      expect.objectContaining({ providerPaymentId: PROVIDER_PAYMENT_ID, source: 'mercadopago' }),
    )
  })

  it('still processes the payment when saving the PaymentAttempt fails', async () => {
    const app = await buildTestApp()
    mockAttemptSave.mockRejectedValue(new Error('Mongo indisponível'))
    mockGetPaymentStatus.mockResolvedValue({ status: 'approved', externalReference: PAYMENT_ID })

    const res = await postWebhook(app, { type: 'payment', data: { id: PROVIDER_PAYMENT_ID } })

    expect(res.statusCode).toBe(200)
    expect(mockConfirmExecute).toHaveBeenCalledWith(PAYMENT_ID, PROVIDER_PAYMENT_ID)
  })

  describe('com MERCADOPAGO_WEBHOOK_SECRET configurado', () => {
    const SECRET = 'test-secret-123'

    beforeEach(() => {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET
    })

    function validSignature(dataId: string, requestId: string, ts: string): string {
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
      const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')
      return `ts=${ts},v1=${v1}`
    }

    it('rejects (200, no-op) when x-signature header is missing', async () => {
      const app = await buildTestApp()

      const res = await postWebhook(app, { type: 'payment', data: { id: PROVIDER_PAYMENT_ID } })

      expect(res.statusCode).toBe(200)
      expect(mockGetPaymentStatus).not.toHaveBeenCalled()
    })

    it('rejects (200, no-op) when the signature is invalid', async () => {
      const app = await buildTestApp()

      const res = await postWebhook(app, { type: 'payment', data: { id: PROVIDER_PAYMENT_ID } }, {
        'x-signature': 'ts=1700000000,v1=deadbeef',
        'x-request-id': 'req-abc',
      })

      expect(res.statusCode).toBe(200)
      expect(mockGetPaymentStatus).not.toHaveBeenCalled()
    })

    it('processes the webhook when the signature is valid', async () => {
      const app = await buildTestApp()
      mockGetPaymentStatus.mockResolvedValue({ status: 'approved', externalReference: PAYMENT_ID })
      const xSignature = validSignature(PROVIDER_PAYMENT_ID, 'req-abc', '1700000000')

      const res = await postWebhook(app, { type: 'payment', data: { id: PROVIDER_PAYMENT_ID } }, {
        'x-signature': xSignature,
        'x-request-id': 'req-abc',
      })

      expect(res.statusCode).toBe(200)
      expect(mockConfirmExecute).toHaveBeenCalledWith(PAYMENT_ID, PROVIDER_PAYMENT_ID)
    })
  })
})
