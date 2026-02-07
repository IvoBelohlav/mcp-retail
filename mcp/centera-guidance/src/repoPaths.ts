import path from 'node:path';
import fs from 'node:fs/promises';

export type ResolvedRepoPath = {
  absolutePath: string;
  relativePath: string;
  realPath?: string;
};

export function resolvePathInsideRepo(repoRoot: string, repoRelativePath: string): ResolvedRepoPath {
  const cleanRelative = repoRelativePath.trim() === '' ? '.' : repoRelativePath;
  const absolutePath = path.resolve(repoRoot, cleanRelative);

  // Fast non-filesystem check to block obvious traversal attempts.
  const rel = path.relative(repoRoot, absolutePath);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Path escapes repoRoot: ${repoRelativePath}`);
  }

  return { absolutePath, relativePath: rel === '' ? '.' : rel };
}

export async function realpathInsideRepo(
  repoRootReal: string,
  absolutePath: string,
): Promise<string> {
  const candidateReal = await fs.realpath(absolutePath);
  const rel = path.relative(repoRootReal, candidateReal);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error('Resolved path escapes repoRoot (symlink traversal?)');
  }
  return candidateReal;
}

