import fs from 'node:fs/promises';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import type { CliArgs } from './cliArgs.js';
import { createLogger } from './logger.js';
import { registerResources } from './serverResources.js';
import { registerPrompts } from './serverPrompts.js';
import { registerTools } from './serverTools.js';

export async function startServer(args: CliArgs): Promise<void> {
  const logger = createLogger(args.logLevel);

  const repoRootStat = await fs.stat(args.repoRoot).catch(() => null);
  if (!repoRootStat || !repoRootStat.isDirectory()) {
    throw new Error(`repoRoot is not a directory: ${args.repoRoot}`);
  }

  const repoRootReal = await fs.realpath(args.repoRoot);
  logger.info(`centera-guidance-mcp repoRoot=${repoRootReal}`);

  const server = new McpServer({
    name: 'centera-guidance',
    version: '0.1.0',
  });

  registerResources(server, { repoRoot: repoRootReal, logger });
  registerPrompts(server);
  registerTools(server, { repoRoot: repoRootReal, logger });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep stdout clean; this is only for human debugging.
  logger.info('centera-guidance-mcp started (stdio)');

  // Prevent an unhandled rejection from crashing silently.
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${String(reason)}`);
  });
}

export type ServerContext = {
  repoRoot: string;
  logger: ReturnType<typeof createLogger>;
};

// Shared input schema fragments (v1 accepts raw shapes; we use z.object for clarity).
export const schemas = {
  repoPath: z.string().describe('Path relative to the repo root'),
};
