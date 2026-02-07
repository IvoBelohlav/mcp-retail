import path from 'node:path';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info';

export type CliArgs = {
  repoRoot: string;
  logLevel: LogLevel;
};

function takeValue(args: string[], i: number): { value: string; nextIndex: number } {
  const value = args[i + 1];
  if (!value) throw new Error(`Missing value for ${args[i]}`);
  return { value, nextIndex: i + 2 };
}

export function parseArgs(argv: string[]): CliArgs {
  let repoRoot = process.cwd();
  let logLevel: LogLevel = 'warn';

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i];
    if (!arg) break;

    if (arg === '--repoRoot' || arg === '--repo-root') {
      const { value, nextIndex } = takeValue(argv, i);
      repoRoot = value;
      i = nextIndex;
      continue;
    }

    if (arg === '--logLevel' || arg === '--log-level') {
      const { value, nextIndex } = takeValue(argv, i);
      if (value === 'silent' || value === 'error' || value === 'warn' || value === 'info') {
        logLevel = value;
      } else {
        throw new Error(`Invalid --logLevel value: ${value}`);
      }
      i = nextIndex;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      // Keep this minimal; many MCP hosts ignore CLI help output anyway.
      // Use stderr to avoid interfering with MCP stdio.
      console.error(
        [
          'centera-guidance-mcp',
          '',
          'Options:',
          '  --repoRoot <path>   Restrict file access to this repository root (default: cwd)',
          '  --logLevel <level>  silent|error|warn|info (default: warn)',
        ].join('\n'),
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { repoRoot: path.resolve(repoRoot), logLevel };
}

