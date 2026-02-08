import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBootstrapBundle } from '../src/remoteBootstrap.ts';

test('buildBootstrapBundle: returns effective instructions + architecture (expected)', async () => {
  const treeEntries = [
    { path: 'AGENTS.md', type: 'file' as const },
    { path: 'CLAUDE.md', type: 'file' as const },
    { path: 'frontend/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/features/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/features/contract/components/X.tsx', type: 'file' as const },
  ];

  const repo = {
    listTree: async () => ({ engine: 'github' as const, ref: 'main', truncated: false, entries: treeEntries }),
    readFile: async (repoPath: string) => ({
      path: repoPath,
      text: '- rule\n',
      truncated: false,
      totalBytes: 7,
      readBytes: 7,
    }),
  };

  const arch = {
    repo: { owner: 'o', repo: 'r', ref: 'main' },
    overview: { layout: 'x', apiContractPath: 'backend/openapi/openapi.yaml', principles: [], guidanceResources: [] },
    openapi: { path: 'backend/openapi/openapi.yaml', exists: true },
    frontend: { features: ['contract'] },
    backend: { modules: ['energy'] },
    openspec: { specs: ['something'] },
    warnings: [],
  };

  const bundle = await buildBootstrapBundle(
    {
      repo,
      collectArchitecture: async () => arch,
    },
    { github: { apiBaseUrl: 'https://api.github.test', owner: 'o', repo: 'r', ref: 'main' } },
    { path: 'frontend/src/features/contract/components/X.tsx' },
  );

  assert.equal(bundle.input.mode, 'both');
  assert.equal(bundle.effectiveInstructions.target.kind, 'file');
  assert.deepEqual(bundle.architecture, arch);
  assert.equal(bundle.openapiPlaybook.contractPath, 'backend/openapi/openapi.yaml');
  assert.ok(bundle.repoPointers.frontendPatternResources.length >= 3);
  assert.ok(bundle.suggestedNextCalls.length >= 3);
});

test('buildBootstrapBundle: unknown path still returns a bundle with a note (edge)', async () => {
  const treeEntries = [{ path: 'AGENTS.md', type: 'file' as const }];

  const bundle = await buildBootstrapBundle(
    {
      repo: {
        listTree: async () => ({ engine: 'github' as const, ref: 'main', truncated: false, entries: treeEntries }),
        readFile: async (repoPath: string) => ({
          path: repoPath,
          text: '- root\n',
          truncated: false,
          totalBytes: 7,
          readBytes: 7,
        }),
      },
      collectArchitecture: async () => ({
        repo: { owner: 'o', repo: 'r', ref: 'main' },
        overview: { layout: 'x', apiContractPath: 'backend/openapi/openapi.yaml', principles: [], guidanceResources: [] },
        openapi: { path: 'backend/openapi/openapi.yaml', exists: false },
        frontend: { features: [] },
        backend: { modules: [] },
        openspec: { specs: [] },
        warnings: [],
      }),
    },
    { github: { apiBaseUrl: 'https://api.github.test', owner: 'o', repo: 'r', ref: 'main' } },
    { path: 'frontend/src/does-not-exist.tsx' },
  );

  assert.equal(bundle.effectiveInstructions.target.kind, 'unknown');
  assert.ok((bundle.effectiveInstructions.note ?? '').includes('does not exist'));
});

test('buildBootstrapBundle: instruction read failure does not hard-fail (error)', async () => {
  const treeEntries = [
    { path: 'AGENTS.md', type: 'file' as const },
    { path: 'frontend/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/app.tsx', type: 'file' as const },
  ];

  const bundle = await buildBootstrapBundle(
    {
      repo: {
        listTree: async () => ({ engine: 'github' as const, ref: 'main', truncated: false, entries: treeEntries }),
        readFile: async (repoPath: string) => {
          if (repoPath === 'frontend/AGENTS.md') throw new Error('boom');
          return { path: repoPath, text: '- ok\n', truncated: false, totalBytes: 5, readBytes: 5 };
        },
      },
      collectArchitecture: async () => ({
        repo: { owner: 'o', repo: 'r', ref: 'main' },
        overview: { layout: 'x', apiContractPath: 'backend/openapi/openapi.yaml', principles: [], guidanceResources: [] },
        openapi: { path: 'backend/openapi/openapi.yaml', exists: true },
        frontend: { features: [] },
        backend: { modules: [] },
        openspec: { specs: [] },
        warnings: [],
      }),
    },
    { github: { apiBaseUrl: 'https://api.github.test', owner: 'o', repo: 'r', ref: 'main' } },
    { path: 'frontend/src/app.tsx', mode: 'full' },
  );

  assert.equal(bundle.effectiveInstructions.truncated, true);
  assert.ok(bundle.effectiveInstructions.mergedMarkdown?.includes('Unable to read frontend/AGENTS.md'));
});
