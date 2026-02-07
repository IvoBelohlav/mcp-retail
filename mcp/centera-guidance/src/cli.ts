#!/usr/bin/env node
import { startServer } from './server.js';
import { parseArgs } from './cliArgs.js';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await startServer(args);
}

main().catch((err: unknown) => {
  // Never log to stdout; MCP uses stdout for protocol messages.
  console.error(err);
  process.exitCode = 1;
});

