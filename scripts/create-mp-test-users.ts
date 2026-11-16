// Cria usuarios de teste do Mercado Pago (comprador + vendedor) via API,
// para rodar o Checkout Pro em sandbox sem depender de aprovacao de conta
// de producao. Ver README > "Testar a integracao com Mercado Pago (sandbox)".
//
// Uso:
//   MERCADOPAGO_ACCESS_TOKEN=APP_USR-... npx tsx scripts/create-mp-test-users.ts
//
// Referencia: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/test-cards#editor_8
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN

if (!accessToken) {
  console.error('Defina MERCADOPAGO_ACCESS_TOKEN (credencial da sua aplicacao MP) antes de rodar.')
  process.exit(1)
}

interface TestUser {
  id: number
  nickname: string
  password: string
  email: string
  site_status: string
}

async function createTestUser(label: string): Promise<void> {
  const response = await fetch('https://api.mercadopago.com/users/test', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ site_id: 'MLB' }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Falha ao criar usuario de teste (${label}): ${response.status} ${body}`)
  }

  const user = (await response.json()) as TestUser
  console.log(`\n=== Usuario de teste — ${label} ===`)
  console.log(`id:       ${user.id}`)
  console.log(`email:    ${user.email}`)
  console.log(`senha:    ${user.password}`)
  console.log(`nickname: ${user.nickname}`)
}

async function main() {
  // O vendedor e quem recebe o pagamento: a credencial de teste dele
  // (gerada no painel de uma aplicacao criada dentro dessa conta) substitui
  // MERCADOPAGO_ACCESS_TOKEN no .env do Billing Service.
  await createTestUser('vendedor (configura a aplicacao MP e vira o MERCADOPAGO_ACCESS_TOKEN)')
  // O comprador e quem faz login no checkout (init_point) para simular o
  // pagamento com os cartoes de teste da documentacao.
  await createTestUser('comprador (faz login no checkoutUrl para pagar)')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
