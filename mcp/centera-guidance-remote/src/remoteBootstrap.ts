import type { RemoteGitHubConfig } from './remoteConfig.ts';
import type { RepoFileRead, RepoTreeResult } from './githubRepo.ts';
import type { RemoteArchitectureSnapshot } from './remoteArchitecture.ts';
import {
  computeEffectiveInstructions,
  discoverInstructionFiles,
  type EffectiveInstructions,
  type EffectiveInstructionsMode,
} from './remoteInstructions.ts';

export type BootstrapBundle = {
  input: {
    path: string;
    goal?: string;
    ref: string;
    includeReadme: boolean;
    mode: EffectiveInstructionsMode;
  };
  effectiveInstructions: EffectiveInstructions;
  architecture: RemoteArchitectureSnapshot;
  frontendPlaybook: {
    checklist: string[];
    patterns: Array<{ name: string; repoPath: string; uri: string }>;
  };
  openapiPlaybook: {
    contractPath: string;
    generatedCodePaths: string[];
    regenCommands: { backend: string; frontend: string };
    checklist: string[];
  };
  repoPointers: {
    instructionResources: Array<{ uri: string; repoPath: string }>;
    openspecResources: Array<{ uri: string; repoPath: string }>;
    openapiResources: Array<{ uri: string; repoPath: string }>;
    frontendPatternResources: Array<{ uri: string; repoPath: string }>;
  };
  externalMcpPlaybook: {
    note: string;
    decisionTree: Array<{ when: string; server: string; action: string; example?: string }>;
  };
  suggestedNextCalls: Array<{
    server: string;
    tool: string;
    arguments: Record<string, unknown>;
    when: string;
  }>;
};

export type BootstrapDeps = {
  repo: {
    listTree: (ref?: string) => Promise<RepoTreeResult>;
    readFile: (repoPath: string, opts?: { ref?: string; maxBytes?: number }) => Promise<RepoFileRead>;
  };
  collectArchitecture: (github: RemoteGitHubConfig) => Promise<RemoteArchitectureSnapshot>;
};

export async function buildBootstrapBundle(
  deps: BootstrapDeps,
  config: { github: RemoteGitHubConfig },
  input: {
    path?: string;
    goal?: string;
    ref?: string;
    includeReadme?: boolean;
    mode?: EffectiveInstructionsMode;
    maxBytesPerFile?: number;
    maxSummaryLines?: number;
  },
): Promise<BootstrapBundle> {
  const path = (input.path ?? '.').trim() || '.';
  const ref = (input.ref ?? config.github.ref).trim() || config.github.ref;
  const includeReadme = Boolean(input.includeReadme);
  const mode: EffectiveInstructionsMode = input.mode ?? 'summary';
  const maxBytesPerFile = clampInt(input.maxBytesPerFile ?? 100_000, 1_000, 2_000_000);

  const tree = await deps.repo.listTree(ref);
  const discovery = discoverInstructionFiles(tree.entries, { includeReadme, truncated: tree.truncated });

  const effectiveInstructions = await computeEffectiveInstructions({
    targetPath: path,
    treeEntries: tree.entries,
    discovery,
    mode,
    maxSummaryLines: input.maxSummaryLines,
    readFile: async (repoPath: string) => {
      const file = await deps.repo.readFile(repoPath, { ref, maxBytes: maxBytesPerFile });
      return { text: file.text, truncated: file.truncated };
    },
  });

  const architecture = await deps.collectArchitecture({ ...config.github, ref });

  return {
    input: { path, goal: input.goal, ref, includeReadme, mode },
    effectiveInstructions,
    architecture,
    frontendPlaybook: buildFrontendPlaybook(),
    openapiPlaybook: buildOpenApiPlaybook(),
    repoPointers: buildRepoPointers(),
    externalMcpPlaybook: buildExternalMcpPlaybook(),
    suggestedNextCalls: buildSuggestedNextCalls(input.goal),
  };
}

function buildFrontendPlaybook(): BootstrapBundle['frontendPlaybook'] {
  const patterns = [
    { name: 'DetailLayout (tabs)', repoPath: 'frontend/src/layouts/DetailLayout.tsx', uri: 'centera://docs/frontend/detail-layout' },
    { name: 'SaveActions (sticky save)', repoPath: 'frontend/src/shared/components/SaveActions/SaveActions.tsx', uri: 'centera://docs/frontend/save-actions' },
    { name: 'ErrorAlert (translated)', repoPath: 'frontend/src/shared/components/ErrorAlert/ErrorAlert.tsx', uri: 'centera://docs/frontend/error-alert' },
    { name: 'LoadingButton', repoPath: 'frontend/src/shared/components/LoadingButton/LoadingButton.tsx', uri: 'centera://docs/frontend/loading-button' },
    { name: 'uiTokens', repoPath: 'frontend/src/shared/constants/uiTokens.ts', uri: 'centera://docs/frontend/ui-tokens' },
    { name: 'Theme constants', repoPath: 'frontend/src/theme/constants.ts', uri: 'centera://docs/frontend/theme-constants' },
    { name: 'i18n config', repoPath: 'frontend/src/i18n/index.ts', uri: 'centera://docs/frontend/i18n' },
  ];

  return {
    checklist: [
      'Prefer existing layouts/components instead of inventing new patterns (tabs, forms, dialogs).',
      'Use DetailLayout + MUI Tabs for detail pages with sections.',
      'Wrap long edit forms in SaveActions so Save/Cancel stays discoverable (sticky top/bottom).',
      'Do not hardcode user-facing strings; add i18n keys in frontend/src/i18n/locales/{cs,en}/ and call t(key).',
      'Use shared ErrorAlert for error surfaces; use notistack for transient success/warn/info messages.',
      'Use theme tokens/uiTokens for spacing and consistency; avoid ad-hoc colors and spacing values.',
    ],
    patterns,
  };
}

function buildOpenApiPlaybook(): BootstrapBundle['openapiPlaybook'] {
  const contractPath = 'backend/openapi/openapi.yaml';
  const generatedCodePaths = ['backend/target/generated-sources/openapi/', 'frontend/src/api/generated/'];

  return {
    contractPath,
    generatedCodePaths,
    regenCommands: {
      backend: 'cd backend && mvn clean compile',
      frontend: 'cd frontend && npm run generate:api',
    },
    checklist: [
      `Update ${contractPath} first for any API/schema changes (contract-first).`,
      'Do not edit generated code under: ' + generatedCodePaths.join(', '),
      'After OpenAPI changes: regenerate backend and frontend clients.',
      'Backend: implement generated delegate interfaces in *ApiDelegateImpl; avoid ad-hoc controllers that diverge from the contract.',
    ],
  };
}

function buildRepoPointers(): BootstrapBundle['repoPointers'] {
  return {
    instructionResources: [
      { uri: 'centera://docs/agents', repoPath: 'AGENTS.md' },
      { uri: 'centera://docs/claude', repoPath: 'CLAUDE.md' },
    ],
    openspecResources: [
      { uri: 'centera://docs/openspec/agents', repoPath: 'openspec/AGENTS.md' },
      { uri: 'centera://docs/openspec/project', repoPath: 'openspec/project.md' },
    ],
    openapiResources: [{ uri: 'centera://docs/openapi', repoPath: 'backend/openapi/openapi.yaml' }],
    frontendPatternResources: [
      { uri: 'centera://docs/frontend/detail-layout', repoPath: 'frontend/src/layouts/DetailLayout.tsx' },
      { uri: 'centera://docs/frontend/save-actions', repoPath: 'frontend/src/shared/components/SaveActions/SaveActions.tsx' },
      { uri: 'centera://docs/frontend/error-alert', repoPath: 'frontend/src/shared/components/ErrorAlert/ErrorAlert.tsx' },
      { uri: 'centera://docs/frontend/loading-button', repoPath: 'frontend/src/shared/components/LoadingButton/LoadingButton.tsx' },
      { uri: 'centera://docs/frontend/ui-tokens', repoPath: 'frontend/src/shared/constants/uiTokens.ts' },
      { uri: 'centera://docs/frontend/theme-constants', repoPath: 'frontend/src/theme/constants.ts' },
      { uri: 'centera://docs/frontend/i18n', repoPath: 'frontend/src/i18n/index.ts' },
    ],
  };
}

function buildExternalMcpPlaybook(): BootstrapBundle['externalMcpPlaybook'] {
  return {
    note: 'This server does not call other MCP servers. Use the host (Codex) to orchestrate those calls.',
    decisionTree: [
      {
        when: 'Need a library/API solution or a non-trivial algorithm/spec implementation',
        server: 'context7',
        action: 'Resolve the library id, then query docs for the exact API usage pattern.',
      },
      {
        when: 'Need to validate DB assumptions (schemas, constraints, live data)',
        server: 'postgres-mcp',
        action: 'Run a read-only SQL query to verify assumptions before coding.',
      },
      {
        when: 'Need to verify API endpoint behavior',
        server: 'curl',
        action: 'Start with GET requests against the local API; only mutate if explicitly asked.',
        example: 'curl_get { url: \"http://localhost:4000/api/...\" }',
      },
      {
        when: 'Need up-to-date or unstable facts (latest versions, current events, changing docs)',
        server: 'tavily',
        action: 'Use web search / extract for current info.',
      },
    ],
  };
}

function buildSuggestedNextCalls(goal?: string): BootstrapBundle['suggestedNextCalls'] {
  const goalText = typeof goal === 'string' ? goal.trim() : '';

  return [
    {
      server: 'context7',
      tool: 'resolve-library-id',
      arguments: { libraryName: '<package>', query: goalText || '<what you are trying to do>' },
      when: 'Before adding a dependency or implementing a non-trivial algorithm/spec.',
    },
    {
      server: 'context7',
      tool: 'query-docs',
      arguments: { libraryId: '<from resolve-library-id>', query: goalText || '<what you are trying to do>' },
      when: 'After selecting a library id, to get current stable API examples.',
    },
    {
      server: 'postgres-mcp',
      tool: 'query',
      arguments: { sql: 'SELECT 1;' },
      when: 'When confirming database constraints or assumptions (read-only).',
    },
    {
      server: 'curl',
      tool: 'curl_get',
      arguments: { url: 'http://localhost:4000/api/health' },
      when: 'When verifying local API behavior quickly.',
    },
    {
      server: 'tavily',
      tool: 'tavily_search',
      arguments: { query: goalText || 'search query' },
      when: 'When you need up-to-date info beyond the repo.',
    },
  ];
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}
