import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { MercadoPagoPaymentProvider } from '../../../src/infrastructure/providers/payment/MercadoPagoPaymentProvider.js'

// So roda contra a API real do Mercado Pago quando MERCADOPAGO_ACCESS_TOKEN
// estiver presente (credencial de teste do vendedor - ver README). Sem o
// token, o teste e pulado em vez de falhar, para nao travar o CI antes da
// credencial existir (ver ADR 0006/README > "Testar a integracao com
// Mercado Pago (sandbox)").
const hasToken = Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)

describe.skipIf(!hasToken)('MercadoPagoPaymentProvider (sandbox real)', () => {
  it('cria uma preferencia de pagamento valida no Checkout Pro', async () => {
    const provider = new MercadoPagoPaymentProvider()

    const result = await provider.createPreference({
      externalReference: randomUUID(),
      description: 'Smoke test - Castor Garage (Fase 4)',
      amount: 10,
    })

    expect(result.checkoutUrl).toMatch(/^https:\/\/(www\.)?mercadopago\.com/)
  })
})
