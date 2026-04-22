/**
 * GitHubMessageReader
 *
 * Reads a per-message directory inbox, verifies signatures,
 * and ingests valid messages into a local MessageStore.
 *
 * Pairs with GitHubMessageTransport.
 *
 * Read flow:
 *   1. GET directory listing for spaces/{address}/messages/
 *   2. Filter to .json files not yet in store
 *   3. Fetch each new file individually (parallel)
 *   4. Parse + verify each envelope
 *   5. Ingest valid messages into store
 *
 * Why this is fast:
 *   - Directory listing returns all message metadata in one call
 *   - Already-seen messages skipped before any file fetch
 *   - New messages fetched in parallel
 *   - No file merging or content diffing needed
 */

import type { SignedEnvelope, MessageStore, StoredMessage } from '../types/index.js';
import { verifyEnvelope } from '../envelope/index.js';

export interface GitHubMessageReaderConfig {
  apiBase?: string;
  owner: string;
  repo: string;
  branch?: string;
  token: string;
  resolveMessagesPath?: (address: string) => string;
  /** Max parallel file fetches (default: 5) */
  concurrency?: number;
}

export interface MessageReadResult {
  ingested: number;
  rejected: RejectedMessage[];
  found: number;
  skipped: number;
}

export interface RejectedMessage {
  path: string;
  reason: string;
}

interface GitHubDirEntry {
  type: 'file' | 'dir';
  name: string;
  path: string;
  sha: string;
  download_url: string | null;
}

interface GitHubFileResponse {
  content: string;
}

function defaultMessagesPath(address: string): string {
  return `spaces/${address}/messages`;
}

/** Fetch files in batches to avoid rate limits */
async function fetchInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
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

  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
  };

  async function listMessageFiles(address: string): Promise<GitHubDirEntry[]> {
    const path = resolveMessagesPath(address);
    const url = `${apiBase}/repos/${config.owner}/${config.repo}/contents/${path}?ref=${branch}`;
    const res = await fetch(url, { headers });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Directory listing failed: ${res.status} ${res.statusText}`);
    const entries = (await res.json()) as GitHubDirEntry[];
    return entries.filter(e => e.type === 'file' && e.name.endsWith('.json'));
  }

  async function fetchMessageFile(entry: GitHubDirEntry): Promise<SignedEnvelope> {
    const url = `${apiBase}/repos/${config.owner}/${config.repo}/contents/${entry.path}?ref=${branch}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`File fetch failed: ${res.status} ${entry.path}`);
    const data = (await res.json()) as GitHubFileResponse;
    const json = Buffer.from(data.content, 'base64').toString('utf-8');
    return JSON.parse(json) as SignedEnvelope;
  }

  return {
    /**
     * Poll the message directory for a recipient address.
     * Skips already-stored messages, fetches new ones in parallel,
     * verifies signatures, and ingests valid messages.
     */
    async poll(
      recipientAddress: string,
      store: MessageStore
    ): Promise<MessageReadResult> {
      const entries = await listMessageFiles(recipientAddress);

      if (entries.length === 0) {
        return { ingested: 0, rejected: [], found: 0, skipped: 0 };
      }

      // Derive message IDs from filenames (reverse of messageFilePath sanitization)
      // Skip entries already in store without fetching their content
      const newEntries: GitHubDirEntry[] = [];
      let skipped = 0;

      for (const entry of entries) {
        const messageId = entry.name.replace(/\.json$/, '');
        const existing = await store.get(messageId);
        if (existing) {
          skipped++;
        } else {
          newEntries.push(entry);
        }
      }

      if (newEntries.length === 0) {
        return { ingested: 0, rejected: [], found: entries.length, skipped };
      }

      // Fetch new messages in parallel batches
      const rejected: RejectedMessage[] = [];
      let ingested = 0;

      const results = await fetchInBatches(
        newEntries,
        async (entry) => {
          try {
            const envelope = await fetchMessageFile(entry);
            return { entry, envelope, error: null };
          } catch (err) {
            return {
              entry,
              envelope: null,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        concurrency
      );

      for (const result of results) {
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
        ingested++;
      }

      return { ingested, rejected, found: entries.length, skipped };
    },
  };
}
