import test from 'node:test';
import assert from 'node:assert/strict';

import { collectRemoteArchitectureSnapshot } from '../src/remoteArchitecture.ts';

function makeContentsUrlMatcher(url: URL): string | null {
  const m = url.pathname.match(/\/repos\/[^/]+\/[^/]+\/contents\/(.*)$/);
  if (!m) return null;
  const suffix = m[1] ?? '';
  // The GitHub API expects each segment encoded, but slashes preserved.
  return decodeURIComponent(suffix);
}

function dir(items: Array<{ name: string; type: 'dir' | 'file'; path: string }>): Response {
  return new Response(JSON.stringify(items), { status: 200, headers: { 'content-type': 'application/json' } });
}

function file(repoPath: string, text: string): Response {
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  return new Response(
    JSON.stringify({
      type: 'file',
      path: repoPath,
      size: Buffer.byteLength(text, 'utf8'),
      encoding: 'base64',
      content: b64,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

test('collectRemoteArchitectureSnapshot: includes database conventions and parsed compose/env (expected)', async () => {
  const fetchImpl = async (input: string) => {
    const url = new URL(input);
    const repoPath = makeContentsUrlMatcher(url);
    if (repoPath == null) return new Response('not found', { status: 404 });

    if (repoPath === 'backend/openapi/openapi.yaml') return file(repoPath, 'openapi: 3.0.0\n');

    if (repoPath === 'frontend/src/features') {
      return dir([{ name: 'payment', type: 'dir', path: 'frontend/src/features/payment' }]);
    }
    if (repoPath === 'backend/src/main/java/com/centera') {
      return dir([{ name: 'billing', type: 'dir', path: 'backend/src/main/java/com/centera/billing' }]);
    }
    if (repoPath === 'openspec/specs') {
      return dir([{ name: 'frontend-ui', type: 'dir', path: 'openspec/specs/frontend-ui' }]);
    }

    if (repoPath === 'backend/db') {
      return dir([
        { name: '.env.example', type: 'file', path: 'backend/db/.env.example' },
        { name: 'docker-compose.yml', type: 'file', path: 'backend/db/docker-compose.yml' },
        { name: 'centera_dump.backup', type: 'file', path: 'backend/db/centera_dump.backup' },
        { name: 'init', type: 'dir', path: 'backend/db/init' },
        { name: 'pgadmin', type: 'dir', path: 'backend/db/pgadmin' },
      ]);
    }

    if (repoPath === 'backend/db/.env.example') {
      return file(
        repoPath,
        [
          'POSTGRES_DB=centera',
          'POSTGRES_USER=centera',
          'POSTGRES_PASSWORD=centera_pass',
          'POSTGRES_PORT=5432',
          'PGADMIN_DEFAULT_EMAIL=admin@centera.cz',
          'PGADMIN_DEFAULT_PASSWORD=admin',
          'PGADMIN_PORT=5050',
          '',
        ].join('\n'),
      );
    }

    if (repoPath === 'backend/db/docker-compose.yml') {
      return file(
        repoPath,
        [
          "version: '3.8'",
          '',
          'services:',
          '  postgres:',
          '    image: postgres:17-alpine',
          '    container_name: centera-db',
          '  pgadmin:',
          '    image: dpage/pgadmin4:latest',
          '    container_name: centera-pgadmin',
          '',
          'volumes:',
          '  postgres_data:',
          '    name: centera_postgres_data',
          '',
          'networks:',
          '  centera-network:',
          '    name: centera_network',
          '',
        ].join('\n'),
      );
    }

    if (repoPath === 'backend/db/init') {
      return dir([{ name: '01-init-database.sql', type: 'file', path: 'backend/db/init/01-init-database.sql' }]);
    }
    if (repoPath === 'backend/db/pgadmin') {
      return dir([{ name: 'servers.json', type: 'file', path: 'backend/db/pgadmin/servers.json' }]);
    }

    if (repoPath === 'backend/src/main/resources/db/migration') {
      return dir([
        { name: 'V1.0.0__baseline_schema.sql', type: 'file', path: 'backend/src/main/resources/db/migration/V1.0.0__baseline_schema.sql' },
        { name: 'V1.10.0__something.sql', type: 'file', path: 'backend/src/main/resources/db/migration/V1.10.0__something.sql' },
        { name: 'R__refresh_view.sql', type: 'file', path: 'backend/src/main/resources/db/migration/R__refresh_view.sql' },
      ]);
    }

    return new Response('not found', { status: 404 });
  };

  const snapshot = await collectRemoteArchitectureSnapshot(
    { apiBaseUrl: 'https://api.github.test', owner: 'o', repo: 'r', ref: 'main' },
    fetchImpl,
  );

  assert.equal(snapshot.database.infraPath, 'backend/db');
  assert.equal(snapshot.database.defaults.database, 'centera');
  assert.equal(snapshot.database.envExample.variables.POSTGRES_PASSWORD, '<redacted>');
  assert.ok(snapshot.database.envExample.redactedKeys.includes('POSTGRES_PASSWORD'));

  assert.deepEqual(snapshot.database.dockerCompose.services, [
    { name: 'pgadmin', containerName: 'centera-pgadmin' },
    { name: 'postgres', containerName: 'centera-db' },
  ]);

  assert.equal(snapshot.database.flyway.count, 3);
  assert.deepEqual(snapshot.database.flyway.migrationFiles, [
    'V1.0.0__baseline_schema.sql',
    'V1.10.0__something.sql',
    'R__refresh_view.sql',
  ]);
  assert.deepEqual(snapshot.database.conventions.schemas, ['centera', 'audit']);
});

test('collectRemoteArchitectureSnapshot: tolerates missing optional db directories (edge)', async () => {
  const fetchImpl = async (input: string) => {
    const url = new URL(input);
    const repoPath = makeContentsUrlMatcher(url);
    if (repoPath == null) return new Response('not found', { status: 404 });

    if (repoPath === 'backend/openapi/openapi.yaml') return new Response('not found', { status: 404 });
    if (repoPath === 'frontend/src/features') return dir([]);
    if (repoPath === 'backend/src/main/java/com/centera') return dir([]);
    if (repoPath === 'openspec/specs') return dir([]);

    if (repoPath === 'backend/db') return dir([]);
    if (repoPath === 'backend/db/.env.example') return new Response('not found', { status: 404 });
    if (repoPath === 'backend/db/docker-compose.yml') return file(repoPath, 'services:\n  postgres:\n    image: postgres:17-alpine\n');
    if (repoPath === 'backend/db/init') return new Response('not found', { status: 404 });
    if (repoPath === 'backend/db/pgadmin') return new Response('not found', { status: 404 });
    if (repoPath === 'backend/src/main/resources/db/migration') return dir([]);

    return new Response('not found', { status: 404 });
  };

  const snapshot = await collectRemoteArchitectureSnapshot(
    { apiBaseUrl: 'https://api.github.test', owner: 'o', repo: 'r', ref: 'main' },
    fetchImpl,
  );

  assert.equal(snapshot.database.envExample.exists, false);
  assert.deepEqual(snapshot.database.dockerCompose.services, [{ name: 'postgres' }]);
  assert.equal(snapshot.database.initScripts.exists, false);
  assert.equal(snapshot.database.pgadmin.exists, false);
});

test('collectRemoteArchitectureSnapshot: survives GitHub API failures (error)', async () => {
  const fetchImpl = async () => new Response('boom', { status: 500 });

  const snapshot = await collectRemoteArchitectureSnapshot(
    { apiBaseUrl: 'https://api.github.test', owner: 'o', repo: 'r', ref: 'main' },
    fetchImpl,
  );

  assert.equal(snapshot.database.dockerCompose.exists, false);
  assert.ok(snapshot.warnings.some((w) => w.includes('Unable to list directory: backend/db')));
  assert.ok(snapshot.warnings.some((w) => w.includes('Unable to read file: backend/db/docker-compose.yml')));
});

