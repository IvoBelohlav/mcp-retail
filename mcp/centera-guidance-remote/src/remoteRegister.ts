import { z } from 'zod';

import type { RemoteConfig } from './remoteConfig.ts';
import { createGitHubRepoClient } from './githubRepo.ts';
import { checkGuardrails } from './remoteGuardrails.ts';
import { collectRemoteArchitectureSnapshot } from './remoteArchitecture.ts';
import { registerPrompts } from './remotePrompts.ts';
import { registerResources } from './remoteResources.ts';
import { buildInstructionTree, computeEffectiveInstructions, discoverInstructionFiles } from './remoteInstructions.ts';
import { buildBootstrapBundle } from './remoteBootstrap.ts';

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

  server.registerTool(
    'centera_list_instruction_files',
    {
      title: 'List instruction files',
      description: 'List instruction files (AGENTS.md, CLAUDE.md, optionally README.md) in the configured repo.',
      inputSchema: {
        ref: z.string().optional().describe('Git ref (default: env GITHUB_REF)'),
        includeReadme: z.boolean().optional().describe('Include README.md files (default: false)'),
        maxResults: z.number().int().optional().describe('Max results returned (default: 200, max: 2000)'),
      },
    },
    async ({
      ref,
      includeReadme,
      maxResults,
    }: {
      ref?: string;
      includeReadme?: boolean;
      maxResults?: number;
    }) => {
      const tree = await repo.listTree(ref);
      const discovery = discoverInstructionFiles(tree.entries, {
        includeReadme: Boolean(includeReadme),
        truncated: tree.truncated,
      });

      const limit = clampInt(maxResults ?? 200, 1, 2000);
      const instructionFiles = discovery.instructionFiles.slice(0, limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                includeReadme: discovery.includeReadme,
                truncated: discovery.truncated || discovery.instructionFiles.length > instructionFiles.length,
                note: discovery.note,
                count: instructionFiles.length,
                instructionFiles,
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
    'centera_get_instruction_tree',
    {
      title: 'Instruction tree',
      description: 'Return parent/child relationships between instruction-bearing directories.',
      inputSchema: {
        ref: z.string().optional().describe('Git ref (default: env GITHUB_REF)'),
        includeReadme: z.boolean().optional().describe('Include README.md files (default: false)'),
      },
    },
    async ({ ref, includeReadme }: { ref?: string; includeReadme?: boolean }) => {
      const tree = await repo.listTree(ref);
      const discovery = discoverInstructionFiles(tree.entries, {
        includeReadme: Boolean(includeReadme),
        truncated: tree.truncated,
      });

      const instructionTree = buildInstructionTree(discovery);
      return {
        content: [{ type: 'text', text: JSON.stringify(instructionTree, null, 2) }],
      };
    },
  );

  server.registerTool(
    'centera_get_effective_instructions',
    {
      title: 'Effective instructions',
      description:
        'Compute the effective instruction set (root -> deepest) for a repo path. Useful to avoid missing child AGENTS.md rules.',
      inputSchema: {
        path: z.string().describe('Any repo path (file or directory)'),
        ref: z.string().optional().describe('Git ref (default: env GITHUB_REF)'),
        includeReadme: z.boolean().optional().describe('Include README.md files (default: false)'),
        mode: z
          .enum(['summary', 'full', 'both'])
          .optional()
          .describe('Return summary, merged markdown, or both (default: both)'),
        maxBytesPerFile: z.number().int().optional().describe('Max bytes read per instruction file (default: 100000)'),
        maxSummaryLines: z.number().int().optional().describe('Max summary bullet lines (default: 40)'),
      },
    },
    async ({
      path,
      ref,
      includeReadme,
      mode,
      maxBytesPerFile,
      maxSummaryLines,
    }: {
      path: string;
      ref?: string;
      includeReadme?: boolean;
      mode?: 'summary' | 'full' | 'both';
      maxBytesPerFile?: number;
      maxSummaryLines?: number;
    }) => {
      const tree = await repo.listTree(ref);
      const discovery = discoverInstructionFiles(tree.entries, {
        includeReadme: Boolean(includeReadme),
        truncated: tree.truncated,
      });

      const maxBytes = clampInt(maxBytesPerFile ?? 100_000, 1_000, 2_000_000);
      const effective = await computeEffectiveInstructions({
        targetPath: path,
        treeEntries: tree.entries,
        discovery,
        mode: mode ?? 'both',
        maxSummaryLines,
        readFile: async (repoPath: string) => {
          const file = await repo.readFile(repoPath, { ref, maxBytes });
          return { text: file.text, truncated: file.truncated };
        },
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(effective, null, 2) }],
      };
    },
  );

  server.registerTool(
    'centera_bootstrap',
    {
      title: 'Centera bootstrap bundle',
      description:
        'One-call context bundle: effective instructions, architecture snapshot, OpenAPI-first playbook, and suggested next calls.',
      inputSchema: {
        path: z.string().optional().describe('Repo path you are working in (file or dir). Default: .'),
        goal: z.string().optional().describe('Free-text goal (optional)'),
        ref: z.string().optional().describe('Git ref (default: env GITHUB_REF)'),
        includeReadme: z.boolean().optional().describe('Include README.md instruction files (default: false)'),
        mode: z
          .enum(['summary', 'full', 'both'])
          .optional()
          .describe('Instruction output size mode (default: both)'),
        maxBytesPerFile: z.number().int().optional().describe('Max bytes read per instruction file (default: 100000)'),
        maxSummaryLines: z.number().int().optional().describe('Max summary bullet lines (default: 120)'),
      },
    },
    async ({
      path,
      goal,
      ref,
      includeReadme,
      mode,
      maxBytesPerFile,
      maxSummaryLines,
    }: {
      path?: string;
      goal?: string;
      ref?: string;
      includeReadme?: boolean;
      mode?: 'summary' | 'full' | 'both';
      maxBytesPerFile?: number;
      maxSummaryLines?: number;
    }) => {
      const bundle = await buildBootstrapBundle(
        {
          repo,
          collectArchitecture: collectRemoteArchitectureSnapshot,
        },
        { github: config.github },
        {
          path,
          goal,
          ref,
          includeReadme,
          mode: mode ?? 'both',
          maxBytesPerFile,
          maxSummaryLines,
        },
      );

      return { content: [{ type: 'text', text: JSON.stringify(bundle, null, 2) }] };
    },
  );

  registerResources(server, config);
  registerPrompts(server);
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}
