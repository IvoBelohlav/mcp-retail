import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInstructionTree, computeEffectiveInstructions, discoverInstructionFiles } from '../src/remoteInstructions.ts';

test('discoverInstructionFiles + computeEffectiveInstructions: resolves root -> deepest (expected)', async () => {
  const treeEntries = [
    { path: 'AGENTS.md', type: 'file' as const },
    { path: 'CLAUDE.md', type: 'file' as const },
    { path: 'frontend/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/features/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/features/contract/components/X.tsx', type: 'file' as const },
    { path: 'backend/README.md', type: 'file' as const },
  ];

  const discovery = discoverInstructionFiles(treeEntries, { includeReadme: false, truncated: false });
  assert.equal(discovery.instructionFiles.length, 5);

  const fileTextByPath: Record<string, string> = {
    'AGENTS.md': '- Root rule A\n- Root rule B\n',
    'CLAUDE.md': '- Claude rule\n',
    'frontend/AGENTS.md': '- Frontend rule\n',
    'frontend/src/AGENTS.md': '- Frontend src rule\n',
    'frontend/src/features/AGENTS.md': '- Features rule\n',
  };

  const effective = await computeEffectiveInstructions({
    targetPath: 'frontend/src/features/contract/components/X.tsx',
    treeEntries,
    discovery,
    mode: 'both',
    readFile: async (repoPath) => ({ text: fileTextByPath[repoPath] ?? '', truncated: false }),
  });

  assert.equal(effective.target.kind, 'file');
  assert.equal(effective.target.directory, 'frontend/src/features/contract/components');
  assert.deepEqual(
    effective.filesUsed.map((f) => f.repoPath),
    [
      'AGENTS.md',
      'CLAUDE.md',
      'frontend/AGENTS.md',
      'frontend/src/AGENTS.md',
      'frontend/src/features/AGENTS.md',
    ],
  );
  assert.ok(effective.mergedMarkdown?.includes('# Effective Instructions: frontend/src/features/contract/components/X.tsx'));
  assert.ok(effective.summary?.includes('(AGENTS.md) Root rule A'));
});

test('buildInstructionTree: returns parent/child relationships (edge)', () => {
  const treeEntries = [
    { path: 'AGENTS.md', type: 'file' as const },
    { path: 'frontend/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/features/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/shared/AGENTS.md', type: 'file' as const },
  ];

  const discovery = discoverInstructionFiles(treeEntries, { includeReadme: false, truncated: false });
  const tree = buildInstructionTree(discovery);

  const byDir = new Map(tree.nodes.map((n) => [n.directory, n]));
  assert.equal(byDir.get('.')?.parent ?? null, null);
  assert.equal(byDir.get('frontend')?.parent, '.');
  assert.equal(byDir.get('frontend/src')?.parent, 'frontend');
  assert.equal(byDir.get('frontend/src/features')?.parent, 'frontend/src');
  assert.equal(byDir.get('frontend/src/shared')?.parent, 'frontend/src');
});

test('computeEffectiveInstructions: survives unreadable instruction file (error)', async () => {
  const treeEntries = [
    { path: 'AGENTS.md', type: 'file' as const },
    { path: 'frontend/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/app.tsx', type: 'file' as const },
  ];

  const discovery = discoverInstructionFiles(treeEntries, { includeReadme: false, truncated: false });

  const effective = await computeEffectiveInstructions({
    targetPath: 'frontend/src/app.tsx',
    treeEntries,
    discovery,
    mode: 'full',
    readFile: async (repoPath) => {
      if (repoPath === 'frontend/AGENTS.md') throw new Error('boom');
      return { text: '- ok\n', truncated: false };
    },
  });

  assert.equal(effective.filesUsed.length, 2);
  assert.equal(effective.truncated, true);
  assert.ok(effective.mergedMarkdown?.includes('Unable to read frontend/AGENTS.md'));
});

test('computeEffectiveInstructions: CLAUDE > AGENTS > README precedence within the same directory (expected)', async () => {
  const treeEntries = [
    { path: 'README.md', type: 'file' as const },
    { path: 'AGENTS.md', type: 'file' as const },
    { path: 'CLAUDE.md', type: 'file' as const },
    { path: 'frontend/README.md', type: 'file' as const },
    { path: 'frontend/AGENTS.md', type: 'file' as const },
    { path: 'frontend/src/app.tsx', type: 'file' as const },
  ];

  const discovery = discoverInstructionFiles(treeEntries, { includeReadme: true, truncated: false });

  const effective = await computeEffectiveInstructions({
    targetPath: 'frontend/src/app.tsx',
    treeEntries,
    discovery,
    mode: 'both',
    readFile: async () => ({ text: '- rule\n', truncated: false }),
  });

  assert.deepEqual(
    effective.filesUsed.map((f) => f.repoPath),
    ['AGENTS.md', 'CLAUDE.md', 'frontend/AGENTS.md'],
  );
  assert.deepEqual(effective.referenceFilesUsed.map((f) => f.repoPath), ['README.md', 'frontend/README.md']);
});
