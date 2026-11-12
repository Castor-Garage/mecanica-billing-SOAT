import Fastify, { type FastifyError } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { AppError } from '../../shared/errors/AppError.js'
import { ZodError } from 'zod'
import { loggerOptions } from '../observability/logger.js'
import { requestContext, resolveRequestId } from '../observability/request-context.js'
import { BusinessEventLogger } from '../observability/events.js'

const REQUEST_ID_HEADER = 'x-request-id'

// Billing Service nao tem fachada publica propria (ver ADR 0006): o unico
// endpoint HTTP alem do /health e o webhook do Mercado Pago, que chega aqui
// de fora. O comando GerarOrcamento chega via SQS (consumer a adicionar na
// Fase 2 do backlog), nao por rota HTTP.
export function buildServer() {
  const app = Fastify({
    logger: loggerOptions(),
    requestIdHeader: false,
    requestIdLogLabel: 'requestId',
    genReqId: (req) => resolveRequestId(req.headers[REQUEST_ID_HEADER]),
  }).withTypeProvider<ZodTypeProvider>()

  const events = new BusinessEventLogger(app.log)

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.addHook('onRequest', (request, reply, done) => {
    reply.header(REQUEST_ID_HEADER, request.id)
    requestContext.run({ requestId: request.id }, done)
  })

  // TODO (Fase 2): POST /webhooks/mercadopago - confirmar pagamento e publicar
  // PagamentoConfirmado/PagamentoFalhou em os-events (ver ADR 0006).

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
