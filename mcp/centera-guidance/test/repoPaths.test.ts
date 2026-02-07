import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { resolvePathInsideRepo } from '../src/repoPaths.js';

test('resolvePathInsideRepo: normalizes and stays within repo root (edge case)', () => {
  const repoRoot = path.resolve('/tmp/centera-test-root');
  const resolved = resolvePathInsideRepo(repoRoot, 'a/../b/file.txt');

  assert.equal(resolved.relativePath.replaceAll('\\', '/'), 'b/file.txt');
  assert.equal(resolved.absolutePath, path.resolve(repoRoot, 'b/file.txt'));
});

test('resolvePathInsideRepo: blocks path traversal (error case)', () => {
  const repoRoot = path.resolve('/tmp/centera-test-root');
  assert.throws(() => resolvePathInsideRepo(repoRoot, '../etc/passwd'), /escapes repoRoot/);
});

