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
- [ ] Banco NoSQL para `PaymentAttempt`/payloads de webhook — em decisão
      final entre DynamoDB e MongoDB (ver PR #2, `billing-mp`)
- [ ] 1 fluxo completo testado com BDD (ponta a ponta com os 3 serviços) —
      o fluxo do orquestrador está coberto em
      `mecanica-pos-SOAT/tests/unit/infrastructure/messaging/sagaConsumer.test.ts`
- [x] Secrets de produção/staging: `billing-secret` montado pelo pipeline a
      partir do SSM Parameter Store (ver [CI/CD](#cicd))
- [x] Migration inicial do Prisma (`prisma/migrations/*_init`)
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

As migrations ficam em `prisma/migrations/` e são aplicadas pelo próprio
container ao subir (`prisma migrate deploy` no `CMD` do Dockerfile). Para
mudar o schema: edite `schema.prisma` e rode `npm run db:migrate` com um
Postgres local, que gera a nova migration.

Além do Postgres, o serviço tem uma tabela **DynamoDB**
(`castor-garage-billing-payment-attempts`, chave `paymentId` + `receivedAt`)
para os payloads crus de webhook do Mercado Pago — o banco NoSQL exigido
pela Fase 4. Os dois bancos são provisionados em
[`mecanica-db-infra-SOAT`](https://github.com/Castor-Garage/mecanica-db-infra-SOAT).

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

### Secret do Kubernetes (`billing-secret`)

Nada é criado à mão no cluster: a cada deploy o pipeline monta o
`billing-secret` lendo o SSM Parameter Store, e o step falha se algum
parâmetro não existir.

| Chave | Origem |
|---|---|
| `DATABASE_URL` | SSM `/castor-garage/billing/database-url` (`-staging` em staging) — `mecanica-db-infra-SOAT` |
| `DYNAMODB_PAYMENT_ATTEMPTS_TABLE` | SSM `/castor-garage/billing/payment-attempts-table` — `mecanica-db-infra-SOAT` |
| `SQS_BILLING_COMMANDS_QUEUE_URL`, `SQS_OS_EVENTS_QUEUE_URL` | SSM `/castor-garage/queues/*-url` — `mecanica-k8s-infra-SOAT` (só em produção) |
| `NEW_RELIC_LICENSE_KEY`, `MERCADOPAGO_ACCESS_TOKEN` | secrets do GitHub |

Staging não recebe URLs de fila: só existe um conjunto de filas SQS e um
consumer de staging roubaria mensagens da saga de produção. As credenciais
AWS para SQS/DynamoDB não vão no Secret: os pods usam a LabRole dos nodes
do EKS.

**Ordem de deploy**: o `terraform apply` de `mecanica-k8s-infra-SOAT`
(cluster + filas) e de `mecanica-db-infra-SOAT` (bancos) precisa ter rodado
antes do primeiro deploy deste serviço.

### Webhook do Mercado Pago

O Service `billing-api` é `LoadBalancer` só para o webhook ter uma URL
pública. Depois do rollout o pipeline faz um smoke test em `/health`,
publica a URL completa do webhook em
`/castor-garage/<ambiente>/billing-webhook-url` (SSM) e mostra a URL no
resumo da execução do GitHub Actions — é essa URL que vai no cadastro de
**Webhooks** da aplicação no painel do Mercado Pago.

## Saga Pattern

Este serviço participa da saga **orquestrada pelo OS Service** (não há
orquestrador próprio aqui). Ver ADR 0006 no repositório principal para o
fluxo completo e a estratégia de compensação em caso de falha de pagamento.
