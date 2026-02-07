import type { RemoteGitHubConfig } from './remoteConfig.ts';
import { createGitHubRepoClient } from './githubRepo.ts';

export type RemoteArchitectureSnapshot = {
  repo: { owner: string; repo: string; ref: string };
  overview: {
    layout: string;
    apiContractPath: string;
    principles: string[];
    guidanceResources: string[];
  };
  openapi: { path: string; exists: boolean };
  frontend: { features: string[] };
  backend: { modules: string[] };
  openspec: { specs: string[] };
  warnings: string[];
};

export async function collectRemoteArchitectureSnapshot(
  github: RemoteGitHubConfig,
): Promise<RemoteArchitectureSnapshot> {
  const client = createGitHubRepoClient(github);
  const warnings: string[] = [];

  const openapiPath = 'backend/openapi/openapi.yaml';
  const openapiExists = await client.exists(openapiPath).catch(() => false);

  const frontendFeatures = await listDirs(client, 'frontend/src/features', warnings);
  const backendModules = await listDirs(client, 'backend/src/main/java/com/centera', warnings);
  const openspecSpecs = await listDirs(client, 'openspec/specs', warnings);

  return {
    repo: { owner: github.owner, repo: github.repo, ref: github.ref },
    overview: {
      layout: 'Monorepo: frontend/ (React+TS+Vite), backend/ (Spring Boot+Java 21), openspec/ (spec-driven changes).',
      apiContractPath: openapiPath,
      principles: [
        'OpenAPI-first: update backend/openapi/openapi.yaml, regenerate, then implement delegates.',
        'Do not edit generated code (frontend/src/api/generated, backend/target/generated-sources/openapi).',
        'Do not hardcode user-facing strings; use i18n namespaces under frontend/src/i18n/locales/{cs,en}/.',
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
