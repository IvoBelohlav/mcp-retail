import type { RemoteGitHubConfig } from './remoteConfig.ts';

export type RepoDirEntry = {
  name: string;
  type: 'dir' | 'file' | 'other';
  path: string;
};

export type RepoFileRead = {
  path: string;
  text: string;
  truncated: boolean;
  totalBytes: number;
  readBytes: number;
};

export type RepoSearchMatch = {
  file: string;
  url?: string;
  fragment?: string;
};

export type RepoSearchResult = {
  engine: 'github';
  matches: RepoSearchMatch[];
  truncated: boolean;
  note?: string;
};

export type RepoTreeEntry = {
  path: string;
  type: 'file' | 'dir' | 'other';
  size?: number;
};

export type RepoTreeResult = {
  engine: 'github';
  ref: string;
  truncated: boolean;
  entries: RepoTreeEntry[];
  note?: string;
};

export type GitHubFetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createGitHubRepoClient(config: RemoteGitHubConfig, fetchImpl: GitHubFetch = fetch) {
  const request = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set('Accept', headers.get('Accept') ?? 'application/vnd.github+json');
    headers.set('User-Agent', headers.get('User-Agent') ?? 'centera-guidance-mcp-remote');
    if (config.token) headers.set('Authorization', `Bearer ${config.token}`);

    return await fetchImpl(url, { ...init, headers });
  };

  const getJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const res = await request(url, init);
    if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${url}`);
    return (await res.json()) as T;
  };

  const getContentsUrl = (repoPath: string, ref?: string): string => {
    const pathPart = repoPathToUrlPath(repoPath);
    const qp = new URLSearchParams();
    qp.set('ref', ref ?? config.ref);
    return `${config.apiBaseUrl}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${pathPart}?${qp.toString()}`;
  };

  const listDir = async (repoPath: string, ref?: string): Promise<{ entries: RepoDirEntry[]; truncated: boolean }> => {
    const url = getContentsUrl(repoPath, ref);
    const json = await getJson<unknown>(url);
    if (!Array.isArray(json)) throw new Error('Path is not a directory');

    const entries = json
      .map((item: any): RepoDirEntry | null => {
        const name = typeof item?.name === 'string' ? item.name : null;
        const type = typeof item?.type === 'string' ? item.type : null;
        const itemPath = typeof item?.path === 'string' ? item.path : null;
        if (!name || !type || !itemPath) return null;
        return {
          name,
          type: type === 'dir' ? 'dir' : type === 'file' ? 'file' : 'other',
          path: itemPath,
        };
      })
      .filter((x): x is RepoDirEntry => x != null)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { entries, truncated: false };
  };

  const readFile = async (repoPath: string, opts?: { ref?: string; maxBytes?: number }): Promise<RepoFileRead> => {
    const url = getContentsUrl(repoPath, opts?.ref);
    const json = await getJson<any>(url);
    if (json?.type !== 'file') throw new Error('Path is not a file');

    const totalBytes = typeof json?.size === 'number' ? json.size : 0;
    const maxBytes = clampInt(opts?.maxBytes ?? 200_000, 1_000, 2_000_000);

    const text = await readGitHubFileText(json, request);
    const readBytes = Buffer.byteLength(text, 'utf8');
    const truncated = readBytes > maxBytes || (totalBytes > 0 && totalBytes > maxBytes);

    const finalText = truncated ? sliceUtf8(text, maxBytes) : text;
    const finalReadBytes = Buffer.byteLength(finalText, 'utf8');

    return {
      path: json?.path ?? repoPath,
      text: finalText,
      truncated,
      totalBytes,
      readBytes: finalReadBytes,
    };
  };

  const searchCode = async (opts: {
    query: string;
    path?: string;
    maxResults?: number;
  }): Promise<RepoSearchResult> => {
    const query = opts.query.trim();
    if (!query) throw new Error('query is required');

    const maxResults = clampInt(opts.maxResults ?? 20, 1, 100);
    const qParts = [`${query}`, `repo:${config.owner}/${config.repo}`];
    if (opts.path?.trim()) qParts.push(`path:${opts.path.trim()}`);

    const qp = new URLSearchParams();
    qp.set('q', qParts.join(' '));
    qp.set('per_page', String(Math.min(maxResults, 100)));

    const url = `${config.apiBaseUrl}/search/code?${qp.toString()}`;
    const json = await getJson<any>(url, {
      headers: {
        Accept: 'application/vnd.github.text-match+json',
      },
    });

    const items: any[] = Array.isArray(json?.items) ? json.items : [];
    const matches: RepoSearchMatch[] = items.slice(0, maxResults).map((item: any) => ({
      file: item?.path ?? '',
      url: item?.html_url ?? undefined,
      fragment: item?.text_matches?.[0]?.fragment ?? undefined,
    }));

    return {
      engine: 'github',
      matches: matches.filter((m) => m.file !== ''),
      truncated: items.length > matches.length,
      note: 'GitHub code search targets the repository default branch, not arbitrary refs.',
    };
  };

  const exists = async (repoPath: string, ref?: string): Promise<boolean> => {
    const url = getContentsUrl(repoPath, ref);
    const res = await request(url);
    if (res.status === 404) return false;
    return res.ok;
  };

  const listTree = async (ref?: string): Promise<RepoTreeResult> => {
    const resolvedRef = (ref ?? config.ref).trim() || config.ref;
    const qp = new URLSearchParams();
    qp.set('recursive', '1');

    const url = `${config.apiBaseUrl}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(
      config.repo,
    )}/git/trees/${encodeURIComponent(resolvedRef)}?${qp.toString()}`;

    const json = await getJson<any>(url);
    const tree: any[] = Array.isArray(json?.tree) ? json.tree : [];
    const truncated = Boolean(json?.truncated);

    const entries: RepoTreeEntry[] = tree
      .map((item: any): RepoTreeEntry | null => {
        const itemPath = typeof item?.path === 'string' ? item.path : null;
        const type = typeof item?.type === 'string' ? item.type : null;
        const size = typeof item?.size === 'number' ? item.size : undefined;
        if (!itemPath || !type) return null;
        return {
          path: itemPath,
          type: type === 'blob' ? 'file' : type === 'tree' ? 'dir' : 'other',
          size,
        };
      })
      .filter((x): x is RepoTreeEntry => x != null);

    return {
      engine: 'github',
      ref: resolvedRef,
      truncated,
      entries,
      note: truncated ? 'GitHub tree listing was truncated. Results may be incomplete.' : undefined,
    };
  };

  return { listDir, readFile, searchCode, exists, listTree };
}

async function readGitHubFileText(
  fileJson: any,
  request: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<string> {
  const encoding = fileJson?.encoding;
  const content = typeof fileJson?.content === 'string' ? fileJson.content : null;
  if (encoding === 'base64' && content) {
    const clean = content.replaceAll('\n', '');
    return Buffer.from(clean, 'base64').toString('utf8');
  }

  const downloadUrl = typeof fileJson?.download_url === 'string' ? fileJson.download_url : null;
  if (!downloadUrl) throw new Error('File content not available (missing download_url)');

  const res = await request(downloadUrl);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  return await res.text();
}

function repoPathToUrlPath(repoPath: string): string {
  const clean = repoPath.trim().replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (clean === '' || clean === '.') return '';
  // GitHub expects path segments encoded, but slashes preserved.
  return clean
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}

function sliceUtf8(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  return buf.subarray(0, maxBytes).toString('utf8');
}
