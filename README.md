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
      e publisher dos eventos em `os-events` — hoje sobre `InMemoryMessageBus`
      (porta `IMessageBus`), SQS real entra na Fase 5 sem mudar os use cases
- [x] Use cases de orçamento/aprovação/pagamento (`GenerateQuoteUseCase`,
      `ApproveQuoteUseCase`, `RejectQuoteUseCase`, `ConfirmPaymentUseCase`,
      `FailPaymentUseCase`)
- [x] Integração com Mercado Pago atrás da porta `IPaymentProvider`
      (Checkout Pro: criação de preferência + consulta de status no
      webhook) — **ainda não testada contra a API real**, falta um access
      token de sandbox
- [x] Testes unitários dos use cases: 52 testes, ~97% de cobertura em
      domínio/aplicação
- [ ] Banco NoSQL (MongoDB/DynamoDB) para `PaymentAttempt`/payloads de webhook
- [ ] 1 fluxo completo testado com BDD (ponta a ponta com os 3 serviços)
- [ ] Secrets de produção/staging (`billing-secret`: `DATABASE_URL`,
      `NEW_RELIC_LICENSE_KEY`, credenciais do Mercado Pago)
- [ ] Testar a integração com um access token de sandbox do Mercado Pago

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
`SONAR_TOKEN`.

## Saga Pattern

Este serviço participa da saga **orquestrada pelo OS Service** (não há
orquestrador próprio aqui). Ver ADR 0006 no repositório principal para o
fluxo completo e a estratégia de compensação em caso de falha de pagamento.
