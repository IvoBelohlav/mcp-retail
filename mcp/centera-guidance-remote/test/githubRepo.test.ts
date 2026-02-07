import test from 'node:test';
import assert from 'node:assert/strict';

import { createGitHubRepoClient } from '../src/githubRepo.ts';

test('createGitHubRepoClient.readFile: truncates by maxBytes (edge)', async () => {
  const bigText = 'a'.repeat(2000);
  const client = createGitHubRepoClient(
    { apiBaseUrl: 'https://api.github.test', owner: 'o', repo: 'r', ref: 'main', token: 't' },
    async () =>
      new Response(
        JSON.stringify({
          type: 'file',
          path: 'A.txt',
          size: bigText.length,
          encoding: 'base64',
          content: Buffer.from(bigText, 'utf8').toString('base64'),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );

  const res = await client.readFile('A.txt', { maxBytes: 1000 });
  assert.equal(res.path, 'A.txt');
  assert.equal(res.text.length <= 1000, true);
  assert.equal(res.truncated, true);
});

test('createGitHubRepoClient.listDir: maps directory entries (expected)', async () => {
  const client = createGitHubRepoClient(
    { apiBaseUrl: 'https://api.github.test', owner: 'o', repo: 'r', ref: 'main' },
    async () =>
      new Response(
        JSON.stringify([
          { name: 'a', type: 'dir', path: 'a' },
          { name: 'b.txt', type: 'file', path: 'b.txt' },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );

  const res = await client.listDir('.');
  assert.deepEqual(
    res.entries.map((e) => ({ name: e.name, type: e.type, path: e.path })),
    [
      { name: 'a', type: 'dir', path: 'a' },
      { name: 'b.txt', type: 'file', path: 'b.txt' },
    ],
  );
});

test('createGitHubRepoClient.exists: handles 404 (error)', async () => {
  const client = createGitHubRepoClient(
    { apiBaseUrl: 'https://api.github.test', owner: 'o', repo: 'r', ref: 'main' },
    async () => new Response('not found', { status: 404 }),
  );

  const res = await client.exists('nope.txt');
  assert.equal(res, false);
});
