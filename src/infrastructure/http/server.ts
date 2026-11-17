import Fastify, { type FastifyError } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { AppError } from '../../shared/errors/AppError.js'
import { ZodError } from 'zod'
import { loggerOptions } from '../observability/logger.js'
import { requestContext, resolveRequestId } from '../observability/request-context.js'
import { BusinessEventLogger } from '../observability/events.js'
import { webhookRoutes } from './routes/webhook.routes.js'
import { billingRoutes } from './routes/billing.routes.js'
import { bootstrapBillingCommandsConsumer } from '../messaging/bootstrapConsumers.js'

const REQUEST_ID_HEADER = 'x-request-id'

// Billing Service nao tem fachada publica propria (ver ADR 0006): o unico
// endpoint HTTP alem do /health e o webhook do Mercado Pago, que chega aqui
// de fora. Os comandos (GerarOrcamento/AprovarOrcamento/RejeitarOrcamento)
// chegam via mensageria, consumidos por bootstrapBillingCommandsConsumer.
export async function buildServer() {
  const app = Fastify({
    logger: loggerOptions(),
    requestIdHeader: false,
    requestIdLogLabel: 'requestId',
    genReqId: (req) => resolveRequestId(req.headers[REQUEST_ID_HEADER]),
  }).withTypeProvider<ZodTypeProvider>()

  const events = new BusinessEventLogger(app.log)

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'Billing Service', version: '0.1.0', description: 'Orçamentos e pagamentos — SOAT Fase 4' },
      tags: [
        { name: 'Quotes', description: 'Orçamentos' },
        { name: 'Payments', description: 'Pagamentos' },
        { name: 'Webhooks', description: 'Notificações de provedores de pagamento' },
      ],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })

  app.addHook('onRequest', (request, reply, done) => {
    reply.header(REQUEST_ID_HEADER, request.id)
    requestContext.run({ requestId: request.id }, done)
  })

  app.register(webhookRoutes)
  app.register(billingRoutes)
  bootstrapBillingCommandsConsumer(app.log)

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const route = request.routeOptions.url

    if ('validation' in error && Array.isArray(error.validation)) {
      events.reportFailure(route, 422, error)
      return reply.status(422).send({
        type: 'https://httpstatuses.com/422',
        title: 'Validation Error',
        status: 422,
        detail: 'Os dados fornecidos são inválidos',
        errors: error.validation.map((e) => ({
          field: String(e.instancePath ?? e.schemaPath ?? 'body').replace(/^\//, ''),
          message: e.message,
        })),
      })
    }

    if (error instanceof ZodError) {
      events.reportFailure(route, 422, error)
      return reply.status(422).send({
        type: 'https://httpstatuses.com/422',
        title: 'Validation Error',
        status: 422,
        detail: 'Os dados fornecidos são inválidos',
        errors: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      })
    }

    if (error instanceof AppError) {
      events.reportFailure(route, error.statusCode, error)
      return reply.status(error.statusCode).send({
        type: `https://httpstatuses.com/${error.statusCode}`,
        title: error.name,
        status: error.statusCode,
        detail: error.message,
        code: error.code,
      })
    }

    request.log.error({ err: error }, 'Unhandled error')
    events.reportFailure(route, 500, error)
    return reply.status(500).send({
      type: 'https://httpstatuses.com/500',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Ocorreu um erro interno no servidor',
    })
  })

  return app
}
