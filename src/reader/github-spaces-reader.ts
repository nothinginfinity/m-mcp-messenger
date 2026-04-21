/**
 * GitHubSpacesReader
 *
 * Reads a GitHub-hosted inbox file, parses all SignedEnvelope
 * blocks written by GitHubSpacesTransport, verifies each signature,
 * and ingests valid messages into a local MessageStore.
 *
 * This closes the delivery loop:
 *   GitHubSpacesTransport (send) <-> GitHubSpacesReader (receive)
 *
 * Security model:
 *   Every envelope is verified via EIP-191 before ingestion.
 *   Invalid or tampered envelopes are rejected with a reason.
 *   GitHub is trusted for storage only — never for authenticity.
 *
 * Usage:
 *   const reader = createGitHubSpacesReader(config);
 *   const result = await reader.poll(myAddress, myStore);
 *   console.log(result.ingested, result.rejected);
 */

import type { SignedEnvelope, MessageStore, StoredMessage } from '../types/index.js';
import { verifyEnvelope } from '../envelope/index.js';

export interface GitHubSpacesReaderConfig {
  /** GitHub API base URL (default: https://api.github.com) */
  apiBase?: string;
  /** Repo owner */
  owner: string;
  /** Repo name */
  repo: string;
  /** Branch to read from (default: main) */
  branch?: string;
  /** GitHub personal access token with repo read scope */
  token: string;
  /** Resolve recipient address to inbox file path (default: spaces/{address}/inbox.md) */
  resolveInboxPath?: (address: string) => string;
}

export interface ReadResult {
  /** Number of envelopes successfully verified and ingested */
  ingested: number;
  /** Envelopes that failed verification or parsing */
  rejected: RejectedEnvelope[];
  /** Raw envelope count found in file before verification */
  found: number;
}

export interface RejectedEnvelope {
  /** Raw JSON string that failed, if parseable */
  raw?: string;
  reason: string;
}

interface GitHubFileResponse {
  content: string;
  sha: string;
}

function defaultInboxPath(address: string): string {
  return `spaces/${address}/inbox.md`;
}

/**
 * Parse all fenced JSON blocks from a markdown inbox file.
 * Extracts content between ```json ... ``` markers.
 * Returns raw JSON strings for each block found.
 */
export function parseEnvelopeBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /```json\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

/**
 * Attempt to parse and validate a raw JSON string as a SignedEnvelope.
 * Returns the envelope or throws with a descriptive error.
 */
export function parseEnvelope(raw: string): SignedEnvelope {
  const parsed = JSON.parse(raw) as Partial<SignedEnvelope>;
  const required: (keyof SignedEnvelope)[] = ['id', 'from', 'to', 'payload', 'sentAt', 'signature'];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`Missing required field: ${field}`);
  }
  return parsed as SignedEnvelope;
}

/**
 * Create a GitHubSpacesReader.
 */
export function createGitHubSpacesReader(
  config: GitHubSpacesReaderConfig
) {
  const apiBase = config.apiBase ?? 'https://api.github.com';
  const branch = config.branch ?? 'main';
  const resolveInboxPath = config.resolveInboxPath ?? defaultInboxPath;

  async function fetchInbox(address: string): Promise<string | null> {
    const path = resolveInboxPath(address);
    const url = `${apiBase}/repos/${config.owner}/${config.repo}/contents/${path}?ref=${branch}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as GitHubFileResponse;
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  return {
    /**
     * Poll the inbox for a given recipient address.
     * Parses all envelope blocks, verifies signatures,
     * and ingests valid messages into the provided store.
     *
     * Already-stored messages are skipped (idempotent).
     */
    async poll(
      recipientAddress: string,
      store: MessageStore
    ): Promise<ReadResult> {
      const markdown = await fetchInbox(recipientAddress);

      if (!markdown) {
        return { ingested: 0, rejected: [], found: 0 };
      }

      const blocks = parseEnvelopeBlocks(markdown);
      const rejected: RejectedEnvelope[] = [];
      let ingested = 0;

      for (const raw of blocks) {
        let envelope: SignedEnvelope;

        // Parse
        try {
          envelope = parseEnvelope(raw);
        } catch (err) {
          rejected.push({
            raw,
            reason: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }

        // Skip if already in store (idempotent polling)
        const existing = await store.get(envelope.id);
        if (existing) continue;

        // Verify signature
        const verification = verifyEnvelope(envelope);
        if (!verification.valid) {
          rejected.push({
            raw,
            reason: `Signature invalid: ${verification.reason ?? 'unknown'}`,
          });
          continue;
        }

        // Ingest
        const stored: StoredMessage = {
          envelope,
          status: 'delivered',
          updatedAt: new Date().toISOString(),
          direction: 'inbound',
        };
        await store.put(stored);
        ingested += 1;
      }

      return { ingested, rejected, found: blocks.length };
    },
  };
}
