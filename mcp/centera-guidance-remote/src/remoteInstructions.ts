import type { RepoTreeEntry } from './githubRepo.ts';

export type InstructionFileKind = 'agents' | 'claude' | 'readme';

export type InstructionFile = {
  kind: InstructionFileKind;
  repoPath: string;
  directory: string; // repo-relative dir, '.' for root
};

export type InstructionDiscovery = {
  includeReadme: boolean;
  truncated: boolean;
  instructionFiles: InstructionFile[];
  note?: string;
};

export type InstructionTreeNode = {
  directory: string;
  parent: string | null;
  children: string[];
  instructionFiles: InstructionFile[];
};

export type InstructionTree = {
  includeReadme: boolean;
  nodes: InstructionTreeNode[];
  roots: string[];
  truncated: boolean;
  note?: string;
};

export type EffectiveInstructionsMode = 'summary' | 'full' | 'both';

export type EffectiveInstructions = {
  target: { path: string; kind: 'file' | 'dir' | 'unknown'; directory: string };
  includeReadme: boolean;
  mode: EffectiveInstructionsMode;
  // Authoritative instruction files only (AGENTS.md, CLAUDE.md). README.md is treated as non-authoritative reference.
  filesUsed: InstructionFile[];
  // Non-authoritative reference files (README.md) discovered along the directory chain.
  referenceFilesUsed: InstructionFile[];
  truncated: boolean;
  mergedMarkdown?: string;
  summary?: string;
  referenceMarkdown?: string;
  referenceSummary?: string;
  note?: string;
};

// Default should be detailed enough to avoid constant follow-up calls.
const DEFAULT_SUMMARY_LINES = 120;

export function discoverInstructionFiles(
  treeEntries: RepoTreeEntry[],
  opts: { includeReadme: boolean; truncated: boolean },
): InstructionDiscovery {
  const includeReadme = opts.includeReadme;
  const allowBasenames = includeReadme
    ? new Set(['AGENTS.md', 'CLAUDE.md', 'README.md'])
    : new Set(['AGENTS.md', 'CLAUDE.md']);

  const files: InstructionFile[] = [];
  for (const entry of treeEntries) {
    if (entry.type !== 'file') continue;
    const basename = entry.path.split('/').pop() ?? entry.path;
    if (!allowBasenames.has(basename)) continue;
    files.push({
      kind: basename === 'AGENTS.md' ? 'agents' : basename === 'CLAUDE.md' ? 'claude' : 'readme',
      repoPath: entry.path,
      directory: dirnamePosix(entry.path),
    });
  }

  const instructionFiles = files.sort(compareInstructionFiles);
  const note = opts.truncated
    ? 'Instruction discovery is based on a truncated GitHub tree listing; results may be incomplete.'
    : undefined;

  return { includeReadme, truncated: opts.truncated, instructionFiles, note };
}

export function buildInstructionTree(discovery: InstructionDiscovery): InstructionTree {
  const byDir = groupByDirectory(discovery.instructionFiles);
  const directories = Array.from(byDir.keys()).sort(compareDirsByDepthThenName);

  const nodesByDir = new Map<string, InstructionTreeNode>();
  for (const dir of directories) {
    nodesByDir.set(dir, {
      directory: dir,
      parent: null,
      children: [],
      instructionFiles: byDir.get(dir) ?? [],
    });
  }

  for (const dir of directories) {
    const node = nodesByDir.get(dir);
    if (!node) continue;
    if (dir === '.') continue;

    const parent = findNearestAncestorWithInstructions(dir, nodesByDir);
    node.parent = parent;
    if (parent) {
      const parentNode = nodesByDir.get(parent);
      if (parentNode) parentNode.children.push(dir);
    }
  }

  // Stable children order
  for (const node of nodesByDir.values()) {
    node.children.sort(compareDirsByDepthThenName);
  }

  const nodes = Array.from(nodesByDir.values()).sort((a, b) => compareDirsByDepthThenName(a.directory, b.directory));
  const roots = nodes.filter((n) => n.parent == null).map((n) => n.directory);

  return {
    includeReadme: discovery.includeReadme,
    nodes,
    roots,
    truncated: discovery.truncated,
    note: discovery.note,
  };
}

export function computeEffectiveInstructions(opts: {
  targetPath: string;
  treeEntries: RepoTreeEntry[];
  discovery: InstructionDiscovery;
  mode: EffectiveInstructionsMode;
  maxSummaryLines?: number;
  readFile: (repoPath: string) => Promise<{ text: string; truncated: boolean }>;
}): Promise<EffectiveInstructions> {
  return computeEffectiveInstructionsImpl(opts);
}

async function computeEffectiveInstructionsImpl(opts: {
  targetPath: string;
  treeEntries: RepoTreeEntry[];
  discovery: InstructionDiscovery;
  mode: EffectiveInstructionsMode;
  maxSummaryLines?: number;
  readFile: (repoPath: string) => Promise<{ text: string; truncated: boolean }>;
}): Promise<EffectiveInstructions> {
  const normalizedTarget = normalizeRepoPath(opts.targetPath);
  const { kind, directory, exists } = inferTarget(normalizedTarget, opts.treeEntries);

  const dirChain = buildDirChain(directory);
  const byDir = groupByDirectory(opts.discovery.instructionFiles);
  const filesUsedAll: InstructionFile[] = [];
  for (const dir of dirChain) {
    const items = byDir.get(dir);
    if (!items || items.length === 0) continue;
    filesUsedAll.push(...items);
  }

  const mode = opts.mode;
  const includeReadme = opts.discovery.includeReadme;
  const maxSummaryLines = clampInt(opts.maxSummaryLines ?? DEFAULT_SUMMARY_LINES, 1, 200);

  let anyTruncated = opts.discovery.truncated;
  let mergedMarkdown: string | undefined;
  let summary: string | undefined;
  let referenceMarkdown: string | undefined;
  let referenceSummary: string | undefined;

  const filesUsed = filesUsedAll.filter((f) => f.kind !== 'readme');
  const referenceFilesUsed = filesUsedAll.filter((f) => f.kind === 'readme');

  const authoritativeTexts: Array<{ file: InstructionFile; text: string }> = [];
  for (const f of filesUsed) {
    try {
      const res = await opts.readFile(f.repoPath);
      if (res.truncated) anyTruncated = true;
      authoritativeTexts.push({ file: f, text: res.text });
    } catch (err) {
      // Missing/unreadable instruction files should not hard-fail; return what we can.
      anyTruncated = true;
      authoritativeTexts.push({
        file: f,
        text: `<!-- Unable to read ${f.repoPath}: ${toErrorMessage(err)} -->\n`,
      });
    }
  }

  if (mode === 'full' || mode === 'both') {
    mergedMarkdown = renderMergedMarkdown(normalizedTarget, authoritativeTexts);
  }

  if (mode === 'summary' || mode === 'both') {
    summary = renderSummary(authoritativeTexts, { maxLines: maxSummaryLines });
  }

  if ((mode === 'full' || mode === 'both') && includeReadme && referenceFilesUsed.length > 0) {
    const referenceTexts: Array<{ file: InstructionFile; text: string }> = [];
    for (const f of referenceFilesUsed) {
      try {
        const res = await opts.readFile(f.repoPath);
        if (res.truncated) anyTruncated = true;
        referenceTexts.push({ file: f, text: res.text });
      } catch (err) {
        anyTruncated = true;
        referenceTexts.push({
          file: f,
          text: `<!-- Unable to read ${f.repoPath}: ${toErrorMessage(err)} -->\n`,
        });
      }
    }
    referenceMarkdown = renderReferenceMarkdown(normalizedTarget, referenceTexts);
    if (mode === 'both') referenceSummary = renderSummary(referenceTexts, { maxLines: maxSummaryLines });
  }

  const noteParts: string[] = [];
  if (!exists) noteParts.push('Target path does not exist on this ref; instructions were resolved by directory heuristics.');
  if (opts.discovery.note) noteParts.push(opts.discovery.note);
  if (includeReadme && referenceFilesUsed.length > 0) {
    noteParts.push('README.md files are included as non-authoritative reference only (not part of the instruction chain).');
  }

  return {
    target: { path: normalizedTarget, kind, directory },
    includeReadme,
    mode,
    filesUsed,
    referenceFilesUsed,
    truncated: anyTruncated,
    mergedMarkdown,
    summary,
    referenceMarkdown,
    referenceSummary,
    note: noteParts.length ? noteParts.join(' ') : undefined,
  };
}

function inferTarget(
  targetPath: string,
  treeEntries: RepoTreeEntry[],
): { kind: 'file' | 'dir' | 'unknown'; directory: string; exists: boolean } {
  const files = new Set<string>();
  const dirs = new Set<string>(['.']);

  for (const entry of treeEntries) {
    if (entry.type === 'file') {
      files.add(entry.path);
      addParentDirs(entry.path, dirs);
    } else if (entry.type === 'dir') {
      dirs.add(normalizeRepoPath(entry.path));
      addParentDirs(entry.path, dirs);
    }
  }

  if (targetPath === '.' || targetPath === '') return { kind: 'dir', directory: '.', exists: true };

  if (files.has(targetPath)) {
    return { kind: 'file', directory: dirnamePosix(targetPath), exists: true };
  }

  if (dirs.has(targetPath) || hasFileWithPrefix(files, `${targetPath}/`)) {
    return { kind: 'dir', directory: targetPath, exists: true };
  }

  // Unknown path: best-effort heuristics.
  const last = targetPath.split('/').pop() ?? '';
  const looksLikeFile = last.includes('.');
  return { kind: 'unknown', directory: looksLikeFile ? dirnamePosix(targetPath) : targetPath, exists: false };
}

function addParentDirs(filePath: string, dirs: Set<string>) {
  const clean = normalizeRepoPath(filePath);
  const parts = clean.split('/').filter(Boolean);
  let cur = '';
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur ? `${cur}/${parts[i]}` : parts[i];
    dirs.add(cur);
  }
}

function hasFileWithPrefix(files: Set<string>, prefix: string): boolean {
  for (const f of files) {
    if (f.startsWith(prefix)) return true;
  }
  return false;
}

function buildDirChain(dir: string): string[] {
  const clean = normalizeRepoPath(dir);
  if (clean === '.' || clean === '') return ['.'];

  const parts = clean.split('/').filter(Boolean);
  const out: string[] = ['.'];
  let cur = '';
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    out.push(cur);
  }
  return out;
}

function groupByDirectory(files: InstructionFile[]): Map<string, InstructionFile[]> {
  const map = new Map<string, InstructionFile[]>();
  for (const f of files) {
    const dir = f.directory || '.';
    const list = map.get(dir) ?? [];
    list.push(f);
    map.set(dir, list);
  }
  // Stable order within each directory.
  for (const [dir, list] of map.entries()) {
    map.set(dir, list.sort(compareInstructionFiles));
  }
  return map;
}

function findNearestAncestorWithInstructions(dir: string, nodesByDir: Map<string, InstructionTreeNode>): string | null {
  let cur = dir;
  while (cur !== '.' && cur !== '') {
    cur = dirnamePosix(cur);
    if (nodesByDir.has(cur)) return cur;
  }
  return nodesByDir.has('.') ? '.' : null;
}

function renderMergedMarkdown(targetPath: string, fileTexts: Array<{ file: InstructionFile; text: string }>): string {
  const sections = fileTexts.map(({ file, text }, i) => {
    const title = `${i + 1}. ${file.repoPath}`;
    return `## ${title}\n\n${text.trim()}\n`;
  });

  return [
    `# Effective Instructions: ${targetPath}`,
    '',
    'Authoritative precedence: files are applied from top to bottom. If instructions conflict, the deeper (later) file wins; otherwise rules are additive.',
    'README.md files are not treated as authoritative instructions. If included, they appear separately as reference.',
    '',
    ...sections,
  ].join('\n');
}

function renderReferenceMarkdown(targetPath: string, fileTexts: Array<{ file: InstructionFile; text: string }>): string {
  const sections = fileTexts.map(({ file, text }, i) => {
    const title = `${i + 1}. ${file.repoPath}`;
    return `## ${title}\n\n${text.trim()}\n`;
  });

  return [
    `# Reference Docs: ${targetPath}`,
    '',
    'These README.md files were discovered along the directory chain. They are non-authoritative reference only.',
    '',
    ...sections,
  ].join('\n');
}

function renderSummary(
  fileTexts: Array<{ file: InstructionFile; text: string }>,
  opts: { maxLines: number },
): string {
  const lines: string[] = [];
  for (const { file, text } of fileTexts) {
    const extracted = extractRuleLines(text, Math.max(1, Math.floor(opts.maxLines / Math.max(1, fileTexts.length))));
    for (const l of extracted) {
      lines.push(`- (${file.repoPath}) ${l}`);
      if (lines.length >= opts.maxLines) break;
    }
    if (lines.length >= opts.maxLines) break;
  }

  return ['# Effective Instructions (Summary)', '', ...lines].join('\n');
}

function extractRuleLines(markdown: string, maxLines: number): string[] {
  const out: string[] = [];
  const rawLines = markdown.split('\n');
  let inCode = false;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (!trimmed) continue;

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (bullet?.[1]) out.push(bullet[1]);
    else if (numbered?.[1]) out.push(numbered[1]);

    if (out.length >= maxLines) break;
  }

  return out;
}

function compareInstructionFiles(a: InstructionFile, b: InstructionFile): number {
  // Shallow directories first; within same directory, apply precedence:
  // README < AGENTS < CLAUDE (because files are applied top-to-bottom and later wins).
  const d = compareDirsByDepthThenName(a.directory, b.directory);
  if (d !== 0) return d;

  const k = instructionKindOrder(a.kind) - instructionKindOrder(b.kind);
  if (k !== 0) return k;

  return a.repoPath.localeCompare(b.repoPath);
}

function instructionKindOrder(kind: InstructionFileKind): number {
  // Lower number => applied earlier (lower precedence).
  if (kind === 'readme') return 0;
  if (kind === 'agents') return 1;
  return 2; // 'claude'
}

function compareDirsByDepthThenName(a: string, b: string): number {
  const depthA = a === '.' ? 0 : a.split('/').filter(Boolean).length;
  const depthB = b === '.' ? 0 : b.split('/').filter(Boolean).length;
  if (depthA !== depthB) return depthA - depthB;
  return a.localeCompare(b);
}

function dirnamePosix(p: string): string {
  const clean = normalizeRepoPath(p);
  const idx = clean.lastIndexOf('/');
  if (idx === -1) return '.';
  const dir = clean.slice(0, idx);
  return dir === '' ? '.' : dir;
}

function normalizeRepoPath(p: string): string {
  let out = (p ?? '').trim().replaceAll('\\', '/');
  while (out.startsWith('./')) out = out.slice(2);
  while (out.startsWith('/')) out = out.slice(1);
  while (out.endsWith('/') && out !== '/') out = out.slice(0, -1);
  out = out.replaceAll(/\/+/g, '/');
  if (out === '' || out === '/') return '.';
  return out;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
