import fs from 'node:fs/promises';
import path from 'node:path';

import { resolvePathInsideRepo, realpathInsideRepo } from './repoPaths.js';

export type ArchitectureSnapshot = {
  repoRoot: string;
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

export async function collectArchitectureSnapshot(repoRootReal: string): Promise<ArchitectureSnapshot> {
  const rootStat = await fs.stat(repoRootReal);
  if (!rootStat.isDirectory()) {
    throw new Error(`repoRoot is not a directory: ${repoRootReal}`);
  }

  const warnings: string[] = [];

  const openapiPath = 'backend/openapi/openapi.yaml';
  const openapiExists = await pathExists(path.join(repoRootReal, openapiPath));

  const frontendFeatures = await listDirNamesIfExists(repoRootReal, 'frontend/src/features', warnings);
  const backendModules = await listDirNamesIfExists(repoRootReal, 'backend/src/main/java/com/centera', warnings);
  const openspecSpecs = await listDirNamesIfExists(repoRootReal, 'openspec/specs', warnings);

  return {
    repoRoot: repoRootReal,
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

async function listDirNamesIfExists(
  repoRootReal: string,
  repoRelativeDir: string,
  warnings: string[],
): Promise<string[]> {
  const resolved = resolvePathInsideRepo(repoRootReal, repoRelativeDir);
  const dirReal = await realpathInsideRepo(repoRootReal, resolved.absolutePath).catch(() => null);
  if (!dirReal) {
    warnings.push(`Missing directory: ${repoRelativeDir}`);
    return [];
  }

  const entries = await fs.readdir(dirReal, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    warnings.push(`Unable to read directory: ${repoRelativeDir}`);
    return [];
  }

  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function pathExists(absolutePath: string): Promise<boolean> {
  const stat = await fs.stat(absolutePath).catch(() => null);
  return stat != null && stat.isFile();
}
