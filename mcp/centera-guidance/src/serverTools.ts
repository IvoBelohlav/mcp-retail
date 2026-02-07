import fs from 'node:fs/promises';
import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { ServerContext } from './server.js';
import { resolvePathInsideRepo, realpathInsideRepo } from './repoPaths.js';
import { readTextFile } from './textFile.js';
import { searchRepo } from './repoSearch.js';
import { checkGuardrails } from './guardrails.js';
import { collectArchitectureSnapshot } from './architecture.js';

export function registerTools(server: McpServer, ctx: ServerContext): void {
  server.tool(
    'centera_list_dir',
    {
      path: z.string().optional().describe('Directory path relative to repo root (default: .)'),
      maxEntries: z.number().int().optional().describe('Maximum entries to return (default: 200, max: 2000)'),
    },
    async ({ path: repoPath, maxEntries }) => {
      const rel = (repoPath ?? '.').trim() || '.';
      const resolved = resolvePathInsideRepo(ctx.repoRoot, rel);
      const dirReal = await realpathInsideRepo(ctx.repoRoot, resolved.absolutePath);

      const entries = await fs.readdir(dirReal, { withFileTypes: true });
      const limit = clampInt(maxEntries ?? 200, 1, 2000);

      const items = entries.slice(0, limit).map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other',
        path: path.posix.join(resolved.relativePath.replaceAll('\\', '/'), e.name),
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                directory: resolved.relativePath,
                count: items.length,
                truncated: entries.length > items.length,
                entries: items,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'centera_read_file',
    {
      path: z.string().describe('File path relative to repo root'),
      maxBytes: z.number().int().optional().describe('Maximum bytes to read (default: 200000, max: 2000000)'),
    },
    async ({ path: repoPath, maxBytes }) => {
      const rel = repoPath.trim();
      const resolved = resolvePathInsideRepo(ctx.repoRoot, rel);
      const fileReal = await realpathInsideRepo(ctx.repoRoot, resolved.absolutePath);

      const { text, truncated, totalBytes, readBytes } = await readTextFile(fileReal, { maxBytes });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                path: resolved.relativePath,
                truncated,
                totalBytes,
                readBytes,
                text,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'centera_search',
    {
      query: z.string().describe('Search query (string; fixed-string by default)'),
      path: z.string().optional().describe('Search path relative to repo root (default: .)'),
      maxResults: z.number().int().optional().describe('Maximum matches (default: 50, max: 500)'),
      useRegex: z.boolean().optional().describe('Treat query as regex (default: false)'),
    },
    async ({ query, path: repoPath, maxResults, useRegex }) => {
      const result = await searchRepo({
        repoRootReal: ctx.repoRoot,
        query,
        searchPath: repoPath,
        maxResults,
        useRegex,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'centera_guardrails_check',
    {
      paths: z.array(z.string()).describe('Touched file paths (repo-relative preferred)'),
    },
    async ({ paths }) => {
      const report = checkGuardrails(paths);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'centera_describe_architecture',
    {},
    async () => {
      const snapshot = await collectArchitectureSnapshot(ctx.repoRoot);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(snapshot, null, 2),
          },
        ],
      };
    },
  );

  ctx.logger.info(
    'Registered tools: centera_list_dir, centera_read_file, centera_search, centera_guardrails_check, centera_describe_architecture',
  );
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}
