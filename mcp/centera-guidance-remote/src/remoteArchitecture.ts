import type { RemoteGitHubConfig } from './remoteConfig.ts';
import type { GitHubFetch, RepoDirEntry } from './githubRepo.ts';
import { createGitHubRepoClient } from './githubRepo.ts';

export type RemoteDatabaseSnapshot = {
  infraPath: string;
  infraEntries: RepoDirEntry[];
  dockerCompose: {
    path: string;
    exists: boolean;
    services: Array<{ name: string; containerName?: string }>;
    volumes: Array<{ key: string; name?: string }>;
    networks: Array<{ key: string; name?: string }>;
  };
  envExample: {
    path: string;
    exists: boolean;
    variables: Record<string, string>;
    redactedKeys: string[];
  };
  defaults: {
    host: string;
    postgresPort?: number;
    database?: string;
    user?: string;
    pgadminPort?: number;
    pgadminEmail?: string;
  };
  initScripts: { path: string; exists: boolean; files: string[]; count: number };
  pgadmin: { path: string; exists: boolean; entries: RepoDirEntry[] };
  flyway: {
    migrationsPath: string;
    exists: boolean;
    namingPattern: string;
    migrationFiles: string[];
    count: number;
  };
  conventions: { schemas: string[]; initScriptPattern: string };
};

export type RemoteArchitectureSnapshot = {
  repo: { owner: string; repo: string; ref: string };
  overview: {
    layout: string;
    apiContractPath: string;
    principles: string[];
    guidanceResources: string[];
  };
  openapi: { path: string; exists: boolean };
  database: RemoteDatabaseSnapshot;
  frontend: { features: string[] };
  backend: { modules: string[] };
  openspec: { specs: string[] };
  warnings: string[];
};

export async function collectRemoteArchitectureSnapshot(
  github: RemoteGitHubConfig,
  fetchImpl?: GitHubFetch,
): Promise<RemoteArchitectureSnapshot> {
  const client = createGitHubRepoClient(github, fetchImpl);
  const warnings: string[] = [];

  const openapiPath = 'backend/openapi/openapi.yaml';
  const openapiExists = await client.exists(openapiPath).catch(() => false);

  const frontendFeatures = await listDirs(client, 'frontend/src/features', warnings);
  const backendModules = await listDirs(client, 'backend/src/main/java/com/centera', warnings);
  const openspecSpecs = await listDirs(client, 'openspec/specs', warnings);
  const database = await collectDatabaseSnapshot(client, warnings);

  return {
    repo: { owner: github.owner, repo: github.repo, ref: github.ref },
    overview: {
      layout: 'Monorepo: frontend/ (React+TS+Vite), backend/ (Spring Boot+Java 21), openspec/ (spec-driven changes).',
      apiContractPath: openapiPath,
      principles: [
        'OpenAPI-first: update backend/openapi/openapi.yaml, regenerate, then implement delegates.',
        'Do not edit generated code (frontend/src/api/generated, backend/target/generated-sources/openapi).',
        'Do not hardcode user-facing strings; use i18n namespaces under frontend/src/i18n/locales/{cs,en}/.',
        'Database: local docker-compose in backend/db; schema changes via Flyway migrations in backend/src/main/resources/db/migration.',
        'Keep files small (< 500 lines) and follow feature-first/module conventions.',
        'New functionality: add at least 3 tests (happy, edge, error).',
      ],
      guidanceResources: [
        'centera://docs/agents',
        'centera://docs/claude',
        'centera://docs/openspec/agents',
        'centera://docs/openspec/project',
        'centera://docs/openapi',
      ],
    },
    openapi: { path: openapiPath, exists: openapiExists },
    database,
    frontend: { features: frontendFeatures },
    backend: { modules: backendModules },
    openspec: { specs: openspecSpecs },
    warnings,
  };
}

async function listDirs(
  client: ReturnType<typeof createGitHubRepoClient>,
  repoPath: string,
  warnings: string[],
): Promise<string[]> {
  const { entries } = await client.listDir(repoPath).catch(() => {
    warnings.push(`Unable to list directory: ${repoPath}`);
    return { entries: [], truncated: false };
  });

  return entries
    .filter((e) => e.type === 'dir' && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function collectDatabaseSnapshot(
  client: ReturnType<typeof createGitHubRepoClient>,
  warnings: string[],
): Promise<RemoteDatabaseSnapshot> {
  const infraPath = 'backend/db';
  const dockerComposePath = `${infraPath}/docker-compose.yml`;
  const envExamplePath = `${infraPath}/.env.example`;
  const initScriptsPath = `${infraPath}/init`;
  const pgadminPath = `${infraPath}/pgadmin`;
  const migrationsPath = 'backend/src/main/resources/db/migration';

  const infraEntries = await safeListDirEntries(client, infraPath, warnings);

  const envExampleRes = await safeReadFileText(client, envExamplePath, warnings);
  const parsedEnv = envExampleRes.exists ? parseDotEnvKeyValues(envExampleRes.text) : {};
  const { variables: envVariables, redactedKeys } = redactEnvKeys(parsedEnv, [
    'POSTGRES_PASSWORD',
    'PGADMIN_DEFAULT_PASSWORD',
  ]);

  const dockerComposeRes = await safeReadFileText(client, dockerComposePath, warnings);
  const composeInfo = dockerComposeRes.exists ? parseDockerComposeSummary(dockerComposeRes.text) : emptyComposeSummary();

  const initEntries = await safeListDirEntries(client, initScriptsPath, warnings, { allowMissing: true });
  const initFiles = initEntries.filter((e) => e.type === 'file').map((e) => e.name);

  const pgadminEntries = await safeListDirEntries(client, pgadminPath, warnings, { allowMissing: true });

  const migrationEntries = await safeListDirEntries(client, migrationsPath, warnings, { allowMissing: true });
  const migrationFiles = migrationEntries
    .filter((e) => e.type === 'file')
    .map((e) => e.name)
    .sort(compareFlywayFileNames);

  return {
    infraPath,
    infraEntries,
    dockerCompose: {
      path: dockerComposePath,
      exists: dockerComposeRes.exists,
      services: composeInfo.services,
      volumes: composeInfo.volumes,
      networks: composeInfo.networks,
    },
    envExample: {
      path: envExamplePath,
      exists: envExampleRes.exists,
      variables: envVariables,
      redactedKeys,
    },
    defaults: {
      host: 'localhost',
      postgresPort: parseIntOrUndefined(envVariables.POSTGRES_PORT),
      database: envVariables.POSTGRES_DB,
      user: envVariables.POSTGRES_USER,
      pgadminPort: parseIntOrUndefined(envVariables.PGADMIN_PORT),
      pgadminEmail: envVariables.PGADMIN_DEFAULT_EMAIL,
    },
    initScripts: {
      path: initScriptsPath,
      exists: initEntries.length > 0,
      files: initFiles.sort((a, b) => a.localeCompare(b)),
      count: initFiles.length,
    },
    pgadmin: { path: pgadminPath, exists: pgadminEntries.length > 0, entries: pgadminEntries },
    flyway: {
      migrationsPath,
      exists: migrationEntries.length > 0,
      namingPattern: 'V<version>__<description>.sql (Flyway versioned migrations)',
      migrationFiles,
      count: migrationFiles.length,
    },
    conventions: {
      schemas: ['centera', 'audit'],
      initScriptPattern: 'NN-<name>.sql (numeric prefix for init script order, e.g. 01-init-database.sql)',
    },
  };
}

async function safeListDirEntries(
  client: ReturnType<typeof createGitHubRepoClient>,
  repoPath: string,
  warnings: string[],
  opts?: { allowMissing?: boolean },
): Promise<RepoDirEntry[]> {
  const allowMissing = Boolean(opts?.allowMissing);
  const res = await client
    .listDir(repoPath)
    .then(({ entries }) => entries)
    .catch((err) => {
      if (!allowMissing) warnings.push(`Unable to list directory: ${repoPath}`);
      else warnings.push(`Unable to list optional directory: ${repoPath}`);
      void err;
      return null;
    });

  return res ?? [];
}

async function safeReadFileText(
  client: ReturnType<typeof createGitHubRepoClient>,
  repoPath: string,
  warnings: string[],
): Promise<{ exists: boolean; text: string }> {
  const res = await client
    .readFile(repoPath, { maxBytes: 200_000 })
    .then((file) => ({ exists: true, text: file.text }))
    .catch((err) => {
      warnings.push(`Unable to read file: ${repoPath}`);
      void err;
      return { exists: false, text: '' };
    });

  return res;
}

function parseDotEnvKeyValues(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = stripQuotes(rawValue);
  }
  return out;
}

function redactEnvKeys(
  vars: Record<string, string>,
  keys: string[],
): { variables: Record<string, string>; redactedKeys: string[] } {
  const out: Record<string, string> = { ...vars };
  const redactedKeys: string[] = [];
  for (const k of keys) {
    if (out[k] == null) continue;
    out[k] = '<redacted>';
    redactedKeys.push(k);
  }
  return { variables: out, redactedKeys };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseIntOrUndefined(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

type ComposeSummary = {
  services: Array<{ name: string; containerName?: string }>;
  volumes: Array<{ key: string; name?: string }>;
  networks: Array<{ key: string; name?: string }>;
};

function emptyComposeSummary(): ComposeSummary {
  return { services: [], volumes: [], networks: [] };
}

function parseDockerComposeSummary(text: string): ComposeSummary {
  const services = new Map<string, { name: string; containerName?: string }>();
  const volumes = new Map<string, { key: string; name?: string }>();
  const networks = new Map<string, { key: string; name?: string }>();

  const lines = text.split('\n');
  let section: 'services' | 'volumes' | 'networks' | null = null;
  let currentKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const top = line.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (top?.[1]) {
      const key = top[1];
      section = key === 'services' || key === 'volumes' || key === 'networks' ? key : null;
      currentKey = null;
      continue;
    }

    if (section === 'services') {
      const service = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*$/);
      if (service?.[1]) {
        currentKey = service[1];
        services.set(currentKey, { name: currentKey });
        continue;
      }
      const container = line.match(/^\s{4}container_name:\s*(.+?)\s*$/);
      if (container?.[1] && currentKey) {
        const s = services.get(currentKey);
        if (s) s.containerName = stripQuotes(container[1].trim());
      }
    }

    if (section === 'volumes') {
      const volume = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*$/);
      if (volume?.[1]) {
        currentKey = volume[1];
        volumes.set(currentKey, { key: currentKey });
        continue;
      }
      const name = line.match(/^\s{4}name:\s*(.+?)\s*$/);
      if (name?.[1] && currentKey) {
        const v = volumes.get(currentKey);
        if (v) v.name = stripQuotes(name[1].trim());
      }
    }

    if (section === 'networks') {
      const network = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*$/);
      if (network?.[1]) {
        currentKey = network[1];
        networks.set(currentKey, { key: currentKey });
        continue;
      }
      const name = line.match(/^\s{4}name:\s*(.+?)\s*$/);
      if (name?.[1] && currentKey) {
        const n = networks.get(currentKey);
        if (n) n.name = stripQuotes(name[1].trim());
      }
    }
  }

  return {
    services: Array.from(services.values()).sort((a, b) => a.name.localeCompare(b.name)),
    volumes: Array.from(volumes.values()).sort((a, b) => a.key.localeCompare(b.key)),
    networks: Array.from(networks.values()).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function compareFlywayFileNames(a: string, b: string): number {
  const pa = parseFlywayFileName(a);
  const pb = parseFlywayFileName(b);
  if (pa.kind !== pb.kind) return pa.kind === 'versioned' ? -1 : pb.kind === 'versioned' ? 1 : 0;

  if (pa.kind === 'versioned' && pb.kind === 'versioned') {
    const v = compareFlywayVersions(pa.versionParts, pb.versionParts);
    if (v !== 0) return v;
  }

  return a.localeCompare(b);
}

function parseFlywayFileName(name: string): { kind: 'versioned' | 'repeatable' | 'unknown'; versionParts: number[] } {
  // Versioned: V1.2.3__desc.sql
  const versioned = name.match(/^V([0-9]+(?:\.[0-9]+)*)__.*\.sql$/);
  if (versioned?.[1]) {
    const parts = versioned[1].split('.').map((x) => Number.parseInt(x, 10)).filter((n) => Number.isFinite(n));
    return { kind: 'versioned', versionParts: parts };
  }

  // Repeatable: R__desc.sql
  if (/^R__.*\.sql$/.test(name)) return { kind: 'repeatable', versionParts: [] };

  return { kind: 'unknown', versionParts: [] };
}

function compareFlywayVersions(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}
