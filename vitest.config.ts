import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage/unit',
      // src/infrastructure/http e src/infrastructure/messaging/InMemoryMessageBus
      // ja tem testes unitarios proprios (ver tests/unit/infrastructure) - sem
      // isso aqui, essa cobertura existia mas nunca aparecia no relatorio (e o
      // SonarCloud reprovava "Coverage on New Code" em PRs que mexem na
      // camada HTTP, mesmo com testes passando). O resto de infrastructure
      // (DB, SQS, providers externos) fica de fora, como I*.ts.
      include: [
        'src/domain/**',
        'src/application/**',
        'src/infrastructure/http/**',
        'src/infrastructure/messaging/InMemoryMessageBus.ts',
        'src/shared/**',
      ],
      exclude: [
        'src/domain/**/I*.ts',
        // Wiring puro (sem lógica própria) e rota de debug desativada em
        // produção (ver debug.routes.ts) - nenhum dos dois vale a pena
        // testar no nível unitário.
        'src/infrastructure/http/server.ts',
        'src/infrastructure/http/routes/debug.routes.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@application': resolve(__dirname, 'src/application'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
})
