import { z } from 'zod';

export function registerPrompts(server: any): void {
  server.registerPrompt(
    'centera_frontend_change',
    {
      title: 'Centera Frontend Change',
      description: 'Guardrailed prompt template for Centera frontend changes.',
      argsSchema: {
        goal: z.string().describe('What you want to change in the frontend'),
      },
    },
    async ({ goal }: { goal: string }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are modifying the Centera frontend (React + TS + Vite).',
              '',
              `Goal: ${goal}`,
              '',
              'Guardrails:',
              '- Use feature-first structure under frontend/src/features/<feature>/; avoid cross-feature imports.',
              '- Prefer path aliases (@features, @shared, @api, @app, @theme, @layouts, @test, @assets).',
              '- Never hardcode user-facing strings; add i18n keys under frontend/src/i18n/locales/{cs,en}/ and call t(key).',
              '- Do not edit generated API client code under frontend/src/api/generated/. Regenerate via npm run generate:api.',
              '- Every new functionality needs at least 3 unit tests: happy path, edge case, error case.',
              '',
              'Process:',
              '1. Find the closest existing pattern in a similar feature and follow it.',
              '2. Implement minimal changes first; keep files < 500 lines (split if needed).',
              '3. Run: cd frontend && npm run lint && npm run test (and build if needed).',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'centera_backend_change',
    {
      title: 'Centera Backend Change',
      description: 'Guardrailed prompt template for Centera backend changes.',
      argsSchema: {
        goal: z.string().describe('What you want to change in the backend'),
      },
    },
    async ({ goal }: { goal: string }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are modifying the Centera backend (Spring Boot + Java 21, Spring Modulith).',
              '',
              `Goal: ${goal}`,
              '',
              'Guardrails:',
              '- OpenAPI-first: update backend/openapi/openapi.yaml (and paths/schemas) first, then regenerate (mvn clean compile), then implement delegate impls.',
              '- Implement generated delegate interfaces (*ApiDelegate) in *ApiDelegateImpl classes; do not add ad-hoc controllers that diverge from the contract.',
              '- Never edit generated code under backend/target/generated-sources/openapi/.',
              '- Never edit applied Flyway migrations; add a new migration under backend/src/main/resources/db/migration/.',
              '- Every new functionality needs at least 3 tests: happy path, edge case, error case.',
              '',
              'Process:',
              '1. Modify OpenAPI spec if endpoint/schema changes are required.',
              '2. Regenerate: cd backend && mvn clean compile.',
              '3. Implement module code under backend/src/main/java/com/centera/<module>/.',
              '4. Verify: cd backend && mvn test (or mvn clean verify).',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'centera_openapi_change',
    {
      title: 'Centera OpenAPI Change',
      description: 'Guardrailed prompt template for OpenAPI-first changes.',
      argsSchema: {
        goal: z.string().describe('What you want to change in the OpenAPI contract'),
      },
    },
    async ({ goal }: { goal: string }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are changing Centera OpenAPI (contract-first).',
              '',
              `Goal: ${goal}`,
              '',
              'Guardrails:',
              '- backend/openapi/openapi.yaml is the single source of truth.',
              '- Do not edit generated code. Regenerate after spec changes.',
              '',
              'Process:',
              '1. Update backend/openapi/openapi.yaml and referenced paths/schemas.',
              '2. Regenerate backend: cd backend && mvn clean compile.',
              '3. Regenerate frontend client: cd frontend && npm run generate:api.',
              '4. Update implementations and tests (happy, edge, error).',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}

