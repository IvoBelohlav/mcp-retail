import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

import type { RemoteAuthConfig } from './remoteConfig.ts';

export async function verifyBearerToken(
  config: RemoteAuthConfig,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  if (bearerToken !== config.requiredToken) return undefined;

  return {
    token: bearerToken,
    scopes: ['repo:read'],
    clientId: 'centera-guidance-remote',
  };
}
