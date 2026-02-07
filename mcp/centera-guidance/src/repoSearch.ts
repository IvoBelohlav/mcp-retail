import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolvePathInsideRepo, realpathInsideRepo } from './repoPaths.js';

export type SearchMatch = {
  file: string;
  line: number;
  text: string;
};

export type RepoSearchResult = {
  engine: 'rg' | 'fallback';
  matches: SearchMatch[];
  truncated: boolean;
};

export async function searchRepo(opts: {
  repoRootReal: string;
  query: string;
  searchPath?: string;
  maxResults?: number;
  useRegex?: boolean;
  rgCommand?: string;
}): Promise<RepoSearchResult> {
  const query = opts.query.trim();
  if (!query) throw new Error('query is required');

  const maxResults = clampInt(opts.maxResults ?? 50, 1, 500);
  const useRegex = opts.useRegex ?? false;
  const rgCommand = opts.rgCommand ?? 'rg';

  const searchPathRel = (opts.searchPath ?? '.').trim() || '.';
  const resolved = resolvePathInsideRepo(opts.repoRootReal, searchPathRel);
  const searchPathReal = await realpathInsideRepo(opts.repoRootReal, resolved.absolutePath);

  const rgResult = await tryRipgrepSearch({
    rgCommand,
    cwd: opts.repoRootReal,
    query,
    searchPath: resolved.relativePath,
    maxResults,
    useRegex,
  });
  if (rgResult) return rgResult;

  return await fallbackSearch({
    repoRootReal: opts.repoRootReal,
    searchPathReal,
    query,
    maxResults,
    useRegex,
  });
}

async function tryRipgrepSearch(opts: {
  rgCommand: string;
  cwd: string;
  query: string;
  searchPath: string;
  maxResults: number;
  useRegex: boolean;
}): Promise<RepoSearchResult | null> {
  const args: string[] = [
    '--no-heading',
    '--color=never',
    '--line-number',
    '--with-filename',
    '--max-columns=400',
    '--max-columns-preview',
    '--glob',
    '!**/node_modules/**',
    '--glob',
    '!**/.git/**',
  ];

  if (!opts.useRegex) args.push('-F');
  args.push(opts.query, opts.searchPath);

  const { exitCode, stdout, error } = await spawnCapture(opts.rgCommand, args, {
    cwd: opts.cwd,
    maxOutputBytes: 1_000_000,
  });

  if (error) {
    // ENOENT or similar: command not available.
    return null;
  }

  if (exitCode === 1) {
    return { engine: 'rg', matches: [], truncated: false };
  }

  if (exitCode !== 0) {
    throw new Error(`rg failed with exit code ${exitCode}`);
  }

  const matches: SearchMatch[] = [];
  const lines = stdout.split('\n');
  for (const line of lines) {
    if (!line) continue;
    const parsed = parseRgLine(line);
    if (!parsed) continue;
    matches.push(parsed);
    if (matches.length >= opts.maxResults) break;
  }

  return {
    engine: 'rg',
    matches,
    truncated: matches.length >= opts.maxResults && lines.length > matches.length,
  };
}

function parseRgLine(line: string): SearchMatch | null {
  const first = line.indexOf(':');
  if (first <= 0) return null;
  const second = line.indexOf(':', first + 1);
  if (second <= first + 1) return null;

  const file = line.slice(0, first);
  const lineStr = line.slice(first + 1, second);
  const text = line.slice(second + 1);
  const lineNum = Number.parseInt(lineStr, 10);
  if (!Number.isFinite(lineNum)) return null;

  return { file, line: lineNum, text };
}

async function fallbackSearch(opts: {
  repoRootReal: string;
  searchPathReal: string;
  query: string;
  maxResults: number;
  useRegex: boolean;
}): Promise<RepoSearchResult> {
  const matcher = opts.useRegex ? new RegExp(opts.query, 'u') : null;

  const matches: SearchMatch[] = [];
  const maxFiles = 2000;
  let scannedFiles = 0;

  const walk = async (dir: string): Promise<void> => {
    if (matches.length >= opts.maxResults) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (matches.length >= opts.maxResults) return;
      if (shouldSkipName(entry.name)) continue;

      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }

      if (!entry.isFile()) continue;
      scannedFiles += 1;
      if (scannedFiles > maxFiles) return;

      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) continue;
      if (stat.size > 1_000_000) continue;
      if (!looksTextFile(entry.name)) continue;

      const relFile = path.relative(opts.repoRootReal, abs);
      const content = await fs.readFile(abs, 'utf8').catch(() => null);
      if (content == null) continue;

      const lines = content.split(/\r?\n/u);
      for (let i = 0; i < lines.length; i += 1) {
        const lineText = lines[i] ?? '';
        const hit = matcher ? matcher.test(lineText) : lineText.includes(opts.query);
        if (!hit) continue;
        matches.push({ file: relFile, line: i + 1, text: lineText.slice(0, 400) });
        if (matches.length >= opts.maxResults) return;
      }
    }
  };

  await walk(opts.searchPathReal);

  return {
    engine: 'fallback',
    matches,
    truncated: matches.length >= opts.maxResults || scannedFiles > maxFiles,
  };
}

function shouldSkipName(name: string): boolean {
  return (
    name === '.git' ||
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'build' ||
    name === 'target' ||
    name === '.idea' ||
    name === '.vscode'
  );
}

function looksTextFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return (
    ext === '.ts' ||
    ext === '.tsx' ||
    ext === '.js' ||
    ext === '.jsx' ||
    ext === '.mjs' ||
    ext === '.cjs' ||
    ext === '.md' ||
    ext === '.txt' ||
    ext === '.json' ||
    ext === '.yml' ||
    ext === '.yaml' ||
    ext === '.xml' ||
    ext === '.properties' ||
    ext === '.java' ||
    ext === '.sql' ||
    ext === '.sh' ||
    ext === '.toml'
  );
}

async function spawnCapture(
  command: string,
  args: string[],
  opts: { cwd: string; maxOutputBytes: number },
): Promise<{ exitCode: number | null; stdout: string; error: Error | null }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: false,
    });

    let stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let done = false;

    const finish = (result: { exitCode: number | null; stdout: string; error: Error | null }) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    child.on('error', (err) => {
      finish({ exitCode: null, stdout: '', error: err });
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutBytes >= opts.maxOutputBytes) return;
      const remaining = opts.maxOutputBytes - stdoutBytes;
      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      stdoutChunks.push(slice);
      stdoutBytes += slice.length;
    });

    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      finish({ exitCode: code, stdout, error: null });
    });
  });
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}
