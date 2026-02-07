import { z } from 'zod';

import type { RemoteConfig } from './remoteConfig.ts';
import { createGitHubRepoClient } from './githubRepo.ts';
import { checkGuardrails } from './remoteGuardrails.ts';
import { collectRemoteArchitectureSnapshot } from './remoteArchitecture.ts';
import { registerPrompts } from './remotePrompts.ts';
import { registerResources } from './remoteResources.ts';

export function registerCenteraGuidance(server: any, config: RemoteConfig): void {
  const repo = createGitHubRepoClient(config.github);

  server.registerTool(
    'centera_list_dir',
    {
      title: 'List directory',
      description: 'List directory entries in the configured GitHub repo.',
      inputSchema: {
        path: z.string().optional().describe('Repo-relative directory path (default: .)'),
        ref: z.string().optional().describe('Git ref (default: env GITHUB_REF)'),
        maxEntries: z.number().int().optional().describe('Max entries returned (default: 200)'),
      },
    },
    async ({ path, ref, maxEntries }: { path?: string; ref?: string; maxEntries?: number }) => {
      const rel = (path ?? '.').trim() || '.';
      const { entries } = await repo.listDir(rel, ref);
      const limit = clampInt(maxEntries ?? 200, 1, 2000);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                directory: rel,
                count: Math.min(entries.length, limit),
                truncated: entries.length > limit,
                entries: entries.slice(0, limit),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'centera_read_file',
    {
      title: 'Read file',
      description: 'Read a file from the configured GitHub repo.',
      inputSchema: {
        path: z.string().describe('Repo-relative file path'),
        ref: z.string().optional().describe('Git ref (default: env GITHUB_REF)'),
        maxBytes: z.number().int().optional().describe('Max bytes returned (default: 200000)'),
      },
    },
    async ({ path, ref, maxBytes }: { path: string; ref?: string; maxBytes?: number }) => {
      const file = await repo.readFile(path, { ref, maxBytes });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(file, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    'centera_search',
    {
      title: 'Search code (GitHub)',
      description: 'Search code via GitHub code search in the configured repo (default branch).',
      inputSchema: {
        query: z.string().describe('Search query'),
        path: z.string().optional().describe('Optional path qualifier (GitHub code search)'),
        maxResults: z.number().int().optional().describe('Max results (default: 20, max: 100)'),
      },
    },
    async ({ query, path, maxResults }: { query: string; path?: string; maxResults?: number }) => {
      const result = await repo.searchCode({ query, path, maxResults });
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

  server.registerTool(
    'centera_guardrails_check',
    {
      title: 'Guardrails check',
      description: 'Advisory guardrails checker for Centera path conventions.',
      inputSchema: { paths: z.array(z.string()) },
    },
    async ({ paths }: { paths: string[] }) => ({
      content: [{ type: 'text', text: JSON.stringify(checkGuardrails(paths), null, 2) }],
    }),
  );

  server.registerTool(
    'centera_describe_architecture',
    {
      title: 'Describe architecture',
      description: 'Describe Centera repo structure (features/modules/specs) from GitHub.',
      inputSchema: {},
    },
    async () => ({
      content: [
        { type: 'text', text: JSON.stringify(await collectRemoteArchitectureSnapshot(config.github), null, 2) },
      ],
    }),
  );

  registerResources(server, config);
  registerPrompts(server);
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}
