# Billing Service - Castor Garage

Microsserviço responsável por **orçamento, aprovação e pagamento** das
Ordens de Serviço da oficina. Parte da Fase 4 (Tech Challenge SOAT - FIAP),
que divide a antiga aplicação única (`mecanica-pos-SOAT`) em 3
microsserviços com Saga Pattern.

> Decisões de arquitetura completas (split em serviços, mensageria,
> Saga, banco por serviço) estão documentadas em
> [`mecanica-pos-SOAT/docs/adr/0006-arquitetura-microsservicos-fase4.md`](https://github.com/Castor-Garage/mecanica-pos-SOAT/blob/main/docs/adr/0006-arquitetura-microsservicos-fase4.md)
> e [`.../docs/rfc/0004-banco-por-servico.md`](https://github.com/Castor-Garage/mecanica-pos-SOAT/blob/main/docs/rfc/0004-banco-por-servico.md).

## Responsabilidades

- Geração de orçamento a partir do comando `GerarOrcamento` (recebido do
  OS Service via Amazon SQS, fila `billing-commands`).
- Aprovação/rejeição de orçamento.
- Registro e verificação de pagamento, integrado ao **Mercado Pago**.
- Publicação dos eventos `OrcamentoGerado`, `PagamentoConfirmado` e
  `PagamentoFalhou` na fila `os-events`, consumida pelo orquestrador da
  saga no OS Service.

Este serviço **não expõe uma API pública de uso geral** — o único
endpoint HTTP voltado para fora é o webhook do Mercado Pago
(`POST /webhooks/mercadopago`). Toda a integração com o OS Service é
assíncrona via mensageria.

## Estado atual (Fase 2 do backlog concluída)

- [x] Consumer do comando `GerarOrcamento`/`AprovarOrcamento`/`RejeitarOrcamento`
      e publisher dos eventos em `os-events` — porta `IMessageBus`, com dois
      adapters: `InMemoryMessageBus` (testes/dev) e `SqsMessageBus` (SQS
      real, `MESSAGE_BUS_DRIVER=sqs` — ver ADR 0006 em mecanica-pos-SOAT/docs)
- [x] Use cases de orçamento/aprovação/pagamento (`GenerateQuoteUseCase`,
      `ApproveQuoteUseCase`, `RejectQuoteUseCase`, `ConfirmPaymentUseCase`,
      `FailPaymentUseCase`)
- [x] Integração com Mercado Pago atrás da porta `IPaymentProvider`
      (Checkout Pro: criação de preferência + consulta de status no
      webhook) — **ainda não testada contra a API real**, falta um access
      token de sandbox
- [x] Testes unitários dos use cases: 52 testes, ~97% de cobertura em
      domínio/aplicação
- [x] Banco NoSQL (DynamoDB) para `PaymentAttempt`/payloads de webhook —
      `DynamoPaymentAttemptRepository`, tabela provisionada em
      `mecanica-db-infra-SOAT/dynamodb.tf` (ver RFC 0004)
- [ ] 1 fluxo completo testado com BDD (ponta a ponta com os 3 serviços) —
      o fluxo do orquestrador está coberto em
      `mecanica-pos-SOAT/tests/unit/infrastructure/messaging/sagaConsumer.test.ts`
- [ ] Secrets de produção/staging (`billing-secret`: `DATABASE_URL`,
      `NEW_RELIC_LICENSE_KEY`, credenciais do Mercado Pago)
- [ ] Testar a integração com um access token de sandbox do Mercado Pago

## Testar a integração com Mercado Pago (sandbox)

O enunciado da Fase 4 exige integração com o Mercado Pago (não é uma
escolha nossa, está no PDF do desafio). Para testar sem precisar de conta
de produção/aprovação:

1. Crie (ou use) uma conta no [painel de desenvolvedores do Mercado
   Pago](https://www.mercadopago.com.br/developers/panel) e, dentro dela,
   uma aplicação (qualquer nome, ex. "Castor Garage - Billing").
2. Na aplicação, em **Credenciais de teste**, pegue o `Access Token` de
   teste (prefixo `TEST-`) — ele já vem pronto, sem precisar de aprovação.
3. Rode o script abaixo para gerar os 2 usuários de teste (vendedor e
   comprador) que o Mercado Pago exige para simular o Checkout Pro de
   ponta a ponta:
   ```bash
   MERCADOPAGO_ACCESS_TOKEN=TEST-... npm run mp:create-test-users
   ```
4. Dentro da conta de teste do **vendedor** impressa pelo script, crie
   outra aplicação e pegue o `Access Token` de teste dela — é esse valor
   que vai em `MERCADOPAGO_ACCESS_TOKEN` no `.env` (e, mais tarde, no
   secret `MERCADOPAGO_ACCESS_TOKEN` do GitHub Actions deste repositório).
5. Chame `GenerateQuoteUseCase`/`ApproveQuoteUseCase` localmente (ou via
   `npm run test:integration`, que já inclui um smoke test real contra a
   API — pulado automaticamente se a variável não estiver definida) e
   abra o `checkoutUrl` retornado.
6. Faça login no checkout com o e-mail/senha do usuário de teste
   **comprador** e pague com um dos [cartões de
   teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/test-cards)
   (há cartões específicos para simular aprovado, recusado e pendente).
7. Confirme que o webhook (`POST /webhooks/mercadopago`) processou o
   pagamento — para receber a notificação localmente é preciso expor a
   porta com um túnel (ex. `ngrok http 3000`) e cadastrar a URL em
   **Webhooks** na aplicação do Mercado Pago.

## Banco de dados

PostgreSQL próprio (ver `prisma/schema.prisma`): `Quote` e `Payment`.
Nenhuma relação de banco com o OS Service ou o Execução Service — toda
referência entre eles é por id lógico (`serviceOrderId`), recebido via
mensageria.

## Rodar localmente

```bash
cp .env.example .env
npm install
npm run db:generate
npm run dev
```

Requer um PostgreSQL local (`DATABASE_URL` no `.env`) para os comandos
`db:*` e para os testes de integração.

```bash
# Testes
npm run test:unit
npm run test:integration   # requer Postgres rodando, ver vitest.integration.config.ts
npm run test:coverage
```

## Docker

```bash
docker build -t mecanica-billing-soat .
```

## CI/CD

Pipeline em `.github/workflows/pipeline.yml`: testes (unitários +
integração) → SonarCloud → build/push da imagem (GHCR) → deploy via
kustomize no cluster EKS já usado pelo OS Service (`mecanica-k8s-infra-SOAT`),
namespaces `castor-garage-staging`/`castor-garage-production`.

Secrets necessários no repositório (GitHub Actions): `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `NEW_RELIC_LICENSE_KEY`,
`SONAR_TOKEN`. Opcional: `MERCADOPAGO_ACCESS_TOKEN` (credencial de teste do
vendedor — ver "Testar a integração com Mercado Pago (sandbox)" acima);
sem ele o smoke test real do Mercado Pago só é pulado, o resto do pipeline
roda normalmente.

## Saga Pattern

Este serviço participa da saga **orquestrada pelo OS Service** (não há
orquestrador próprio aqui). Ver ADR 0006 no repositório principal para o
fluxo completo e a estratégia de compensação em caso de falha de pagamento.
