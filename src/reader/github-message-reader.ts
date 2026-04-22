/**
 * GitHubMessageReader (v2)
 *
 * Reads a per-message directory inbox using:
 *   1. GitHub Tree API  — single call returns full subtree
 *   2. ReadCache        — persistent set of seen IDs, skips fetching known files
 *
 * API call cost:
 *   Warm poll (cache hit, no new messages): 2 calls (tree + cache load)
 *   Warm poll (cache hit, K new messages):  2 + K calls (tree + cache load + K files)
 *   Cold poll (no cache):                   1 + K calls (tree + K files)
 *   After save:                             +1 call (cache PUT) if any new messages
 *
 * Previous version used GET /contents/{dir} — replaced by Tree API:
 *   - /contents/{dir} returns directory metadata only (no recursive support)
 *   - /git/trees/{sha}?recursive=1 returns entire subtree in one call
 *   - Tree API is also faster and more cache-friendly at GitHub's CDN layer
 */

import type { SignedEnvelope, MessageStore, StoredMessage } from '../types/index.js';
import { verifyEnvelope } from '../envelope/index.js';
import type { ReadCacheStore } from './read-cache.js';
import { createInMemoryReadCache } from './read-cache.js';

export interface GitHubMessageReaderConfig {
  apiBase?: string;
  owner: string;
  repo: string;
  branch?: string;
  token: string;
  resolveMessagesPath?: (address: string) => string;
  /** Max parallel file fetches per batch (default: 5) */
  concurrency?: number;
  /** Persistent read cache. Defaults to in-memory (session-scoped). */
  readCache?: ReadCacheStore;
}

export interface MessageReadResult {
  ingested: number;
  rejected: RejectedMessage[];
  found: number;
  skipped: number;
  /** API calls made this poll (for observability) */
  apiCalls: number;
}

export interface RejectedMessage {
  path: string;
  reason: string;
}

interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  url: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

interface GitHubRefResponse {
  object: { sha: string };
}

interface GitHubFileResponse {
  content: string;
}

function defaultMessagesPath(address: string): string {
  return `spaces/${address}/messages`;
}

async function fetchInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

export function createGitHubMessageReader(
  config: GitHubMessageReaderConfig
) {
  const apiBase = config.apiBase ?? 'https://api.github.com';
  const branch = config.branch ?? 'main';
  const resolveMessagesPath = config.resolveMessagesPath ?? defaultMessagesPath;
  const concurrency = config.concurrency ?? 5;
  const readCache = config.readCache ?? createInMemoryReadCache();

  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
  };

  /**
   * Resolve branch name to commit SHA, then fetch the recursive tree.
   * Returns only .json blobs under the messages path for this address.
   */
  async function fetchMessageTree(
    address: string
  ): Promise<{ entries: GitHubTreeEntry[]; calls: number }> {
    const messagesPath = resolveMessagesPath(address);

    // Step 1: resolve branch to commit SHA
    const refUrl = `${apiBase}/repos/${config.owner}/${config.repo}/git/ref/heads/${branch}`;
    const refRes = await fetch(refUrl, { headers });
    if (!refRes.ok) throw new Error(`Branch ref lookup failed: ${refRes.status}`);
    const refData = (await refRes.json()) as GitHubRefResponse;
    const commitSha = refData.object.sha;

    // Step 2: fetch full recursive tree from commit SHA
    const treeUrl = `${apiBase}/repos/${config.owner}/${config.repo}/git/trees/${commitSha}?recursive=1`;
    const treeRes = await fetch(treeUrl, { headers });
    if (!treeRes.ok) throw new Error(`Tree fetch failed: ${treeRes.status}`);
    const treeData = (await treeRes.json()) as GitHubTreeResponse;

    // Filter to .json blobs under the messages path
    const entries = treeData.tree.filter(
      e => e.type === 'blob' &&
           e.path.startsWith(messagesPath + '/') &&
           e.path.endsWith('.json')
    );

    return { entries, calls: 2 };
  }

  async function fetchMessageFile(
    entry: GitHubTreeEntry
  ): Promise<SignedEnvelope> {
    const url = `${apiBase}/repos/${config.owner}/${config.repo}/contents/${entry.path}?ref=${branch}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`File fetch failed: ${res.status} ${entry.path}`);
    const data = (await res.json()) as GitHubFileResponse;
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')) as SignedEnvelope;
  }

  return {
    async poll(
      recipientAddress: string,
      store: MessageStore
    ): Promise<MessageReadResult> {
      let apiCalls = 0;

      // Load read cache and tree in parallel
      const [cache, { entries, calls: treeCalls }] = await Promise.all([
        readCache.load(recipientAddress),
        fetchMessageTree(recipientAddress),
      ]);
      apiCalls += treeCalls + 1; // tree calls + cache load

      if (entries.length === 0) {
        return { ingested: 0, rejected: [], found: 0, skipped: 0, apiCalls };
      }

      // Determine which entries are new
      // Check cache first (fast), then store (slower, catches cross-session misses)
      const newEntries: GitHubTreeEntry[] = [];
      let skipped = 0;

      for (const entry of entries) {
        const messageId = entry.path.split('/').pop()!.replace(/\.json$/, '');
        if (cache.has(messageId)) {
          skipped++;
          continue;
        }
        // Cache miss — check store as fallback
        const inStore = await store.get(messageId);
        if (inStore) {
          cache.add(messageId); // backfill cache
          skipped++;
          continue;
        }
        newEntries.push(entry);
      }

      if (newEntries.length === 0) {
        // Save backfilled cache if any IDs were added
        if (skipped > 0) await readCache.save(recipientAddress, cache);
        return { ingested: 0, rejected: [], found: entries.length, skipped, apiCalls };
      }

      // Fetch new messages in parallel batches
      const rejected: RejectedMessage[] = [];
      let ingested = 0;

      const results = await fetchInBatches(
        newEntries,
        async (entry) => {
          apiCalls++;
          try {
            const envelope = await fetchMessageFile(entry);
            return { entry, envelope, error: null };
          } catch (err) {
            return { entry, envelope: null, error: err instanceof Error ? err.message : String(err) };
          }
        },
        concurrency
      );

      for (const result of results) {
        const messageId = result.entry.path.split('/').pop()!.replace(/\.json$/, '');

        if (result.error || !result.envelope) {
          rejected.push({ path: result.entry.path, reason: result.error ?? 'fetch failed' });
          continue;
        }

        const verification = verifyEnvelope(result.envelope);
        if (!verification.valid) {
          rejected.push({
            path: result.entry.path,
            reason: `Signature invalid: ${verification.reason ?? 'unknown'}`,
          });
          continue;
        }

        const stored: StoredMessage = {
          envelope: result.envelope,
          status: 'delivered',
          updatedAt: new Date().toISOString(),
          direction: 'inbound',
        };
        await store.put(stored);
        cache.add(messageId);
        ingested++;
      }

      // Persist updated cache
      if (ingested > 0) {
        await readCache.save(recipientAddress, cache);
        apiCalls++;
      }

      return { ingested, rejected, found: entries.length, skipped, apiCalls };
    },
  };
}
