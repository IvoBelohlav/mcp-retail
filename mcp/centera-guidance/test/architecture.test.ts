import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { collectArchitectureSnapshot } from '../src/architecture.js';

test('collectArchitectureSnapshot: lists frontend features and backend modules (expected use case)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'centera-guidance-arch-'));
  try {
    await fs.mkdir(path.join(tmp, 'frontend/src/features/auth'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'frontend/src/features/billing'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'backend/src/main/java/com/centera/contracts'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'backend/src/main/java/com/centera/billing'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'openspec/specs/api-contract-governance'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'backend/openapi'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'backend/openapi/openapi.yaml'), 'openapi: 3.0.3\n', 'utf8');

    const repoRootReal = await fs.realpath(tmp);
    const snap = await collectArchitectureSnapshot(repoRootReal);

    assert.deepEqual(snap.frontend.features, ['auth', 'billing']);
    assert.deepEqual(snap.backend.modules, ['billing', 'contracts']);
    assert.deepEqual(snap.openspec.specs, ['api-contract-governance']);
    assert.equal(snap.openapi.exists, true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('collectArchitectureSnapshot: missing dirs produce warnings and empty lists (edge case)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'centera-guidance-arch-missing-'));
  try {
    const repoRootReal = await fs.realpath(tmp);
    const snap = await collectArchitectureSnapshot(repoRootReal);

    assert.deepEqual(snap.frontend.features, []);
    assert.deepEqual(snap.backend.modules, []);
    assert.deepEqual(snap.openspec.specs, []);
    assert.equal(snap.openapi.exists, false);
    assert.ok(snap.warnings.length >= 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('collectArchitectureSnapshot: throws when repoRoot does not exist (error case)', async () => {
  const tmp = path.join(os.tmpdir(), `centera-guidance-arch-nope-${Date.now()}`);
  await assert.rejects(() => collectArchitectureSnapshot(tmp), /ENOENT|no such file/i);
});

