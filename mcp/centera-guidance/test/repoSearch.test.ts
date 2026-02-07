import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { searchRepo } from '../src/repoSearch.js';

test('searchRepo: returns matches via fallback search (expected use case)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'centera-guidance-mcp-'));
  try {
    await fs.writeFile(path.join(tmp, 'a.txt'), 'hello world\nsecond line\n', 'utf8');

    const repoRootReal = await fs.realpath(tmp);
    const result = await searchRepo({
      repoRootReal,
      query: 'hello',
      searchPath: '.',
      maxResults: 10,
      useRegex: false,
      rgCommand: '/does-not-exist/rg',
    });

    assert.equal(result.engine, 'fallback');
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.file, 'a.txt');
    assert.equal(result.matches[0]?.line, 1);
    assert.match(result.matches[0]?.text ?? '', /hello/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

