/**
 * ReadCache
 *
 * A persistent set of already-seen message IDs.
 * Stored as a JSON file in the repo alongside the message directory:
 *   spaces/{address}/.read-cache.json
 *
 * Lifecycle:
 *   1. load()  — fetch cache from GitHub (or start empty on 404)
 *   2. diff()  — compare directory listing against cache
 *   3. add()   — mark new IDs as seen
 *   4. save()  — write updated cache back to GitHub (single PUT)
 *
 * API call cost:
 *   Cold (no cache file): 0 extra calls (cache miss is free)
 *   Warm (cache exists):  1 GET to load + 1 PUT to save = 2 fixed calls
 *   Net: after first poll, all seen messages are free to skip forever
 */

export interface ReadCacheStore {
  /** Load the cache. Returns empty set if not found. */
  load(address: string): Promise<Set<string>>;
  /** Save the updated cache. */
  save(address: string, ids: Set<string>): Promise<void>;
}

export interface GitHubReadCacheConfig {
  apiBase?: string;
  owner: string;
  repo: string;
  branch?: string;
  token: string;
  /** Resolve address to cache file path (default: spaces/{address}/.read-cache.json) */
  resolveCachePath?: (address: string) => string;
}

interface GitHubFileResponse {
  content: string;
  sha: string;
}

function defaultCachePath(address: string): string {
  return `spaces/${address}/.read-cache.json`;
}

/**
 * Create a GitHub-backed ReadCacheStore.
 */
export function createGitHubReadCache(
  config: GitHubReadCacheConfig
): ReadCacheStore {
  const apiBase = config.apiBase ?? 'https://api.github.com';
  const branch = config.branch ?? 'main';
  const resolveCachePath = config.resolveCachePath ?? defaultCachePath;

  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  // Track SHA per address for updates
  const shaCache = new Map<string, string>();

  return {
    async load(address: string): Promise<Set<string>> {
      const path = resolveCachePath(address);
      const url = `${apiBase}/repos/${config.owner}/${config.repo}/contents/${path}?ref=${branch}`;

      const res = await fetch(url, { headers });
      if (res.status === 404) return new Set<string>();
      if (!res.ok) throw new Error(`ReadCache load failed: ${res.status} ${res.statusText}`);

      const data = (await res.json()) as GitHubFileResponse;
      shaCache.set(address, data.sha);
      const json = Buffer.from(data.content, 'base64').toString('utf-8');
      const ids = JSON.parse(json) as string[];
      return new Set(ids);
    },

    async save(address: string, ids: Set<string>): Promise<void> {
      const path = resolveCachePath(address);
      const url = `${apiBase}/repos/${config.owner}/${config.repo}/contents/${path}`;
      const sha = shaCache.get(address);

      const body: Record<string, unknown> = {
        message: `cache: update read cache for ${address}`,
        content: Buffer.from(JSON.stringify([...ids], null, 2), 'utf-8').toString('base64'),
        branch,
      };
      if (sha) body.sha = sha; // required for updates, omit for first write

      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(`ReadCache save failed: ${res.status} ${err.message ?? res.statusText}`);
      }

      // Update SHA for next save
      const data = await res.json() as { content: { sha: string } };
      shaCache.set(address, data.content.sha);
    },
  };
}

/**
 * In-memory ReadCacheStore for testing and local-only use.
 */
export function createInMemoryReadCache(): ReadCacheStore {
  const store = new Map<string, Set<string>>();

  return {
    async load(address: string): Promise<Set<string>> {
      return store.get(address) ?? new Set();
    },
    async save(address: string, ids: Set<string>): Promise<void> {
      store.set(address, new Set(ids));
    },
  };
}
