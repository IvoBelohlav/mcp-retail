export type GuardrailWarning = {
  code: string;
  message: string;
  suggestion?: string;
};

export type GuardrailsReport = {
  warnings: GuardrailWarning[];
};

export function checkGuardrails(touchedPaths: string[]): GuardrailsReport {
  const normalized = touchedPaths
    .map((p) => normalizePath(p))
    .filter((p) => p !== '');

  const warnings: GuardrailWarning[] = [];

  const has = (prefix: string) => normalized.some((p) => p === prefix || p.startsWith(`${prefix}/`));

  if (has('frontend/src/api/generated')) {
    warnings.push({
      code: 'GENERATED_CODE_EDIT',
      message: 'Detected touched paths under frontend/src/api/generated (generated code).',
      suggestion: 'Do not edit generated code. Update backend/openapi and run `cd frontend && npm run generate:api`.',
    });
  }

  if (has('backend/target/generated-sources/openapi')) {
    warnings.push({
      code: 'GENERATED_CODE_EDIT',
      message: 'Detected touched paths under backend/target/generated-sources/openapi (generated code).',
      suggestion: 'Do not edit generated code. Update backend/openapi and run `cd backend && mvn clean compile`.',
    });
  }

  if (has('backend/openapi')) {
    warnings.push({
      code: 'OPENAPI_REGEN',
      message: 'OpenAPI contract files were touched.',
      suggestion:
        'Regenerate clients after contract changes: `cd backend && mvn clean compile` and `cd frontend && npm run generate:api`.',
    });
  }

  if (has('backend/src/main/resources/db/migration')) {
    warnings.push({
      code: 'FLYWAY_MIGRATION_IMMUTABLE',
      message: 'Flyway migration files were touched.',
      suggestion:
        'Never edit applied migrations. If this is a change to an existing migration, create a new migration instead.',
    });
  }

  if (normalized.some((p) => p.startsWith('frontend/src/') && (p.endsWith('.ts') || p.endsWith('.tsx')))) {
    warnings.push({
      code: 'I18N_NO_HARDCODED_TEXT',
      message: 'Frontend source files were touched.',
      suggestion:
        'Do not hardcode user-facing strings; add i18n keys under frontend/src/i18n/locales/{cs,en}/ and use `t(key)`.',
    });
  }

  if (has('openspec/changes')) {
    warnings.push({
      code: 'OPENSPEC_VALIDATE',
      message: 'OpenSpec change artifacts were touched.',
      suggestion: 'Run `openspec validate <change-id> --strict --no-interactive` before implementation work.',
    });
  }

  return { warnings };
}

function normalizePath(p: string): string {
  let out = p.trim().replaceAll('\\', '/');
  while (out.startsWith('./')) out = out.slice(2);
  while (out.startsWith('/')) out = out.slice(1);
  return out;
}

