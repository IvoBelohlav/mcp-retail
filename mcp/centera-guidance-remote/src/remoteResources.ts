import { readmeResourceText } from './remoteText.ts';
import type { RemoteConfig } from './remoteConfig.ts';
import { createGitHubRepoClient } from './githubRepo.ts';

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

export function registerResources(server: any, config: RemoteConfig): void {
  const client = createGitHubRepoClient(config.github);
  for (const r of resources) {
    server.registerResource(
      r.id,
      r.uri,
      {
        title: r.id,
        description: r.repoPath,
        mimeType: r.mimeType,
      },
      async (uri: URL) => {
        const file = await client.readFile(r.repoPath, { maxBytes: r.maxBytes });
        const suffix = file.truncated
          ? `\n\n[Truncated: ${file.readBytes}/${file.totalBytes} bytes. Use centera_read_file for a larger maxBytes.]\n`
          : '';

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: r.mimeType,
              text: `${file.text}${suffix}`,
            },
          ],
        };
      },
    );
  }

  // Extra: a short readme resource for hosts.
  server.registerResource(
    'readme',
    'centera://docs/readme',
    { title: 'Centera MCP Readme', mimeType: 'text/plain' },
    async (uri: URL) => ({
      contents: [{ uri: uri.href, mimeType: 'text/plain', text: readmeResourceText(config.github) }],
    }),
  );
}
