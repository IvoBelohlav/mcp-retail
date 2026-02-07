import type { RemoteGitHubConfig } from './remoteConfig.ts';

export function readmeResourceText(github: RemoteGitHubConfig): string {
  return [
    'Centera Guidance MCP (Remote)',
    '',
    `Source: github:${github.owner}/${github.repo} (ref: ${github.ref})`,
    'Endpoint: /api/mcp',
    '',
    'Tools:',
    '- centera_list_dir',
    '- centera_read_file',
    '- centera_search',
    '- centera_guardrails_check',
    '- centera_describe_architecture',
    '',
    'Resources:',
    '- centera://docs/agents',
    '- centera://docs/claude',
    '- centera://docs/openspec/agents',
    '- centera://docs/openspec/project',
    '- centera://docs/openapi',
  ].join('\n');
}
