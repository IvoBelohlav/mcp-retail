import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServerContext } from './server.js';
import { resolvePathInsideRepo, realpathInsideRepo } from './repoPaths.js';
import { readTextFile } from './textFile.js';

type StaticResource = {
  id: string;
  uri: string;
  repoPath: string;
  mimeType: string;
  maxBytes?: number;
};

const resources: StaticResource[] = [
  { id: 'agents', uri: 'centera://docs/agents', repoPath: 'AGENTS.md', mimeType: 'text/markdown' },
  { id: 'claude', uri: 'centera://docs/claude', repoPath: 'CLAUDE.md', mimeType: 'text/markdown' },
  {
    id: 'openspec-agents',
    uri: 'centera://docs/openspec/agents',
    repoPath: 'openspec/AGENTS.md',
    mimeType: 'text/markdown',
  },
  {
    id: 'openspec-project',
    uri: 'centera://docs/openspec/project',
    repoPath: 'openspec/project.md',
    mimeType: 'text/markdown',
  },
  {
    id: 'frontend-agents',
    uri: 'centera://docs/frontend/agents',
    repoPath: 'frontend/AGENTS.md',
    mimeType: 'text/markdown',
  },
  {
    id: 'frontend-src-agents',
    uri: 'centera://docs/frontend/src/agents',
    repoPath: 'frontend/src/AGENTS.md',
    mimeType: 'text/markdown',
  },
  {
    id: 'backend-agents',
    uri: 'centera://docs/backend/agents',
    repoPath: 'backend/AGENTS.md',
    mimeType: 'text/markdown',
  },
  {
    id: 'openapi',
    uri: 'centera://docs/openapi',
    repoPath: 'backend/openapi/openapi.yaml',
    mimeType: 'application/yaml',
    maxBytes: 600_000,
  },
];

export function registerResources(server: McpServer, ctx: ServerContext): void {
  for (const r of resources) {
    server.resource(r.id, r.uri, async (uri) => {
      const resolved = resolvePathInsideRepo(ctx.repoRoot, r.repoPath);
      const fileReal = await realpathInsideRepo(ctx.repoRoot, resolved.absolutePath);

      const { text, truncated, totalBytes, readBytes } = await readTextFile(fileReal, {
        maxBytes: r.maxBytes,
      });

      const suffix =
        truncated
          ? `\n\n[Truncated: ${readBytes}/${totalBytes} bytes. Use centera_read_file for a larger maxBytes.]\n`
          : '';

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: r.mimeType,
            text: `${text}${suffix}`,
          },
        ],
      };
    });
  }

  ctx.logger.info(`Registered ${resources.length} resources`);
}
