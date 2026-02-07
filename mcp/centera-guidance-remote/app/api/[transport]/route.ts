import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';

import { parseRemoteConfigFromEnv } from '../../../src/remoteConfig.ts';
import { verifyBearerToken } from '../../../src/remoteAuth.ts';
import { registerCenteraGuidance } from '../../../src/remoteRegister.ts';

export const runtime = 'nodejs';

const handler = createMcpHandler(
  (server) => {
    const config = parseRemoteConfigFromEnv();
    registerCenteraGuidance(server, config);
  },
  {},
  {
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: false,
  },
);

const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  const config = parseRemoteConfigFromEnv();
  return verifyBearerToken(config.auth, bearerToken);
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
