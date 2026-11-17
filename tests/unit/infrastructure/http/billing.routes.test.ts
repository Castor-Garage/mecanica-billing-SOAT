import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { QuoteStatus } from '../../../../src/domain/quote/value-objects/QuoteStatus.js'
import { PaymentStatus } from '../../../../src/domain/payment/value-objects/PaymentStatus.js'
import type { QuoteRecord } from '../../../../src/domain/quote/repositories/IQuoteRepository.js'
import type { PaymentRecord } from '../../../../src/domain/payment/repositories/IPaymentRepository.js'

// vi.hoisted ensures these are available when vi.mock factories run (before module init)
const { mockFindQuoteById, mockFindByServiceOrderId, mockFindPaymentById, mockFindByQuoteId } =
  vi.hoisted(() => ({
    mockFindQuoteById: vi.fn(),
    mockFindByServiceOrderId: vi.fn(),
    mockFindPaymentById: vi.fn(),
    mockFindByQuoteId: vi.fn(),
  }))

vi.mock(
  '../../../../src/infrastructure/database/repositories/PrismaQuoteRepository.js',
  () => ({
    PrismaQuoteRepository: class {
      findById = mockFindQuoteById
      findByServiceOrderId = mockFindByServiceOrderId
      create = vi.fn()
      approve = vi.fn()
      reject = vi.fn()
    },
  }),
)

vi.mock(
  '../../../../src/infrastructure/database/repositories/PrismaPaymentRepository.js',
  () => ({
    PrismaPaymentRepository: class {
      findById = mockFindPaymentById
      findByQuoteId = mockFindByQuoteId
      create = vi.fn()
      confirm = vi.fn()
      fail = vi.fn()
    },
  }),
)

// --- fixtures ---
const QUOTE_ID = '00000000-0000-0000-0000-000000000001'
const PAYMENT_ID = '00000000-0000-0000-0000-000000000002'
const OS_ID = '00000000-0000-0000-0000-000000000003'

function makeQuote(overrides: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: QUOTE_ID,
    serviceOrderId: OS_ID,
    totalAmount: 300,
    status: QuoteStatus.PENDENTE,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    approvedAt: null,
    rejectedAt: null,
    ...overrides,
  }
}

function makePayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: PAYMENT_ID,
    quoteId: QUOTE_ID,
    serviceOrderId: OS_ID,
    provider: 'MERCADO_PAGO',
    providerPaymentId: null,
    checkoutUrl: 'https://mp.test/checkout',
    amount: 300,
    status: PaymentStatus.PENDENTE,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    confirmedAt: null,
    failedAt: null,
    failureReason: null,
    ...overrides,
  }
}

async function buildTestApp() {
  const { billingRoutes } = await import(
    '../../../../src/infrastructure/http/routes/billing.routes.js'
  )
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(billingRoutes)
  return app
}

describe('GET /quotes/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with the quote', async () => {
    const app = await buildTestApp()
    mockFindQuoteById.mockResolvedValue(makeQuote())

    const res = await app.inject({ method: 'GET', url: `/quotes/${QUOTE_ID}` })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(QUOTE_ID)
    expect(body.serviceOrderId).toBe(OS_ID)
    expect(body.totalAmount).toBe(300)
    expect(body.status).toBe('PENDENTE')
  })

  it('returns 404 when quote not found', async () => {
    const app = await buildTestApp()
    mockFindQuoteById.mockResolvedValue(null)

    const res = await app.inject({ method: 'GET', url: `/quotes/${QUOTE_ID}` })

    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for non-uuid param', async () => {
    const app = await buildTestApp()

    const res = await app.inject({ method: 'GET', url: '/quotes/not-a-uuid' })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /quotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with list of quotes', async () => {
    const app = await buildTestApp()
    mockFindByServiceOrderId.mockResolvedValue([makeQuote()])

    const res = await app.inject({ method: 'GET', url: `/quotes?serviceOrderId=${OS_ID}` })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0].serviceOrderId).toBe(OS_ID)
  })

  it('returns 200 empty array when no quotes found', async () => {
    const app = await buildTestApp()
    mockFindByServiceOrderId.mockResolvedValue([])

    const res = await app.inject({ method: 'GET', url: `/quotes?serviceOrderId=${OS_ID}` })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('returns 400 when serviceOrderId is missing', async () => {
    const app = await buildTestApp()

    const res = await app.inject({ method: 'GET', url: '/quotes' })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /payments/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with the payment', async () => {
    const app = await buildTestApp()
    mockFindPaymentById.mockResolvedValue(makePayment())

    const res = await app.inject({ method: 'GET', url: `/payments/${PAYMENT_ID}` })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(PAYMENT_ID)
    expect(body.quoteId).toBe(QUOTE_ID)
    expect(body.amount).toBe(300)
    expect(body.status).toBe('PENDENTE')
  })

  it('returns 404 when payment not found', async () => {
    const app = await buildTestApp()
    mockFindPaymentById.mockResolvedValue(null)

    const res = await app.inject({ method: 'GET', url: `/payments/${PAYMENT_ID}` })

    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for non-uuid param', async () => {
    const app = await buildTestApp()

    const res = await app.inject({ method: 'GET', url: '/payments/not-a-uuid' })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with list of payments', async () => {
    const app = await buildTestApp()
    mockFindByQuoteId.mockResolvedValue([makePayment()])

    const res = await app.inject({ method: 'GET', url: `/payments?quoteId=${QUOTE_ID}` })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0].quoteId).toBe(QUOTE_ID)
  })

  it('returns 200 empty array when no payments found', async () => {
    const app = await buildTestApp()
    mockFindByQuoteId.mockResolvedValue([])

    const res = await app.inject({ method: 'GET', url: `/payments?quoteId=${QUOTE_ID}` })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('returns 400 when quoteId is missing', async () => {
    const app = await buildTestApp()

    const res = await app.inject({ method: 'GET', url: '/payments' })

    expect(res.statusCode).toBe(400)
  })
})
