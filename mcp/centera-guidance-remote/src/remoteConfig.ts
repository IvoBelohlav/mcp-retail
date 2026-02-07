export type RemoteAuthConfig = {
  requiredToken: string;
};

export type RemoteGitHubConfig = {
  apiBaseUrl: string;
  owner: string;
  repo: string;
  ref: string;
  token?: string;
};

export type RemoteConfig = {
  auth: RemoteAuthConfig;
  github: RemoteGitHubConfig;
};

export function parseRemoteConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RemoteConfig {
  const requiredToken = readRequired(env, 'MCP_AUTH_TOKEN');

  return {
    auth: { requiredToken },
    github: {
      apiBaseUrl: env.GITHUB_API_BASE_URL?.trim() || 'https://api.github.com',
      owner: readRequired(env, 'GITHUB_OWNER'),
      repo: readRequired(env, 'GITHUB_REPO'),
      ref: env.GITHUB_REF?.trim() || 'main',
      token: env.GITHUB_TOKEN?.trim() || undefined,
    },
  };
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

