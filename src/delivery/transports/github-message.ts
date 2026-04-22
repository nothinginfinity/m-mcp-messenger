/**
 * GitHubMessageTransport
 *
 * A faster, conflict-free alternative to GitHubSpacesTransport.
 *
 * Architecture:
 *   Each message is written as its own file:
 *     spaces/{recipientAddress}/messages/{messageId}.json
 *
 * Why this is better:
 *   - SEND = 1 API call (PUT new file, no SHA needed)
 *   - READ = 1 API call (GET directory listing)
 *   - Zero merge conflicts — files are immutable and ID-addressed
 *   - Naturally threaded — messages sortable by sentAt or filename
 *   - Idempotent — same id always maps to same path
 *
 * Compared to GitHubSpacesTransport (append to inbox.md):
 *   - Old: GET (fetch SHA + content) → merge → PUT = 2 round trips
 *   - New: PUT new file = 1 round trip
 *
 * Security model:
 *   GitHub is trusted for transport only.
 *   Every envelope is verified via EIP-191 by the reader.
 */

import type { RelayTransport, SignedEnvelope } from '../../types/index.js';

export interface GitHubMessageTransportConfig {
  /** GitHub API base URL (default: https://api.github.com) */
  apiBase?: string;
  /** Repo owner */
  owner: string;
  /** Repo name */
  repo: string;
  /** Branch to write to (default: main) */
  branch?: string;
  /** GitHub personal access token with repo write scope */
  token: string;
  /** Resolve recipient address to message directory path */
  resolveMessagesPath?: (address: string) => string;
}

interface GitHubPutResponse {
  commit: {
    html_url: string;
  };
}

function defaultMessagesPath(address: string): string {
  return `spaces/${address}/messages`;
}

function messageFilePath(messagesPath: string, messageId: string): string {
  // Sanitize messageId for use as filename
  const safe = messageId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `${messagesPath}/${safe}.json`;
}

/**
 * Create a GitHubMessageTransport.
 * Implements RelayTransport — drop-in replacement for GitHubSpacesTransport.
 */
export function createGitHubMessageTransport(
  config: GitHubMessageTransportConfig
): RelayTransport {
  const apiBase = config.apiBase ?? 'https://api.github.com';
  const branch = config.branch ?? 'main';
  const resolveMessagesPath = config.resolveMessagesPath ?? defaultMessagesPath;

  return {
    async canDeliver(envelope: SignedEnvelope): Promise<boolean> {
      // Can deliver to any address — no pre-check needed
      // The PUT will simply create the directory implicitly
      return true;
    },

    async deliver(envelope: SignedEnvelope): Promise<{ relayedTo?: string }> {
      const messagesPath = resolveMessagesPath(envelope.to);
      const filePath = messageFilePath(messagesPath, envelope.id);
      const url = `${apiBase}/repos/${config.owner}/${config.repo}/contents/${filePath}`;

      const body = JSON.stringify({
        message: `deliver: ${envelope.id} → ${envelope.to}`,
        content: Buffer.from(JSON.stringify(envelope, null, 2), 'utf-8').toString('base64'),
        branch,
      });

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(
          `GitHubMessageTransport delivery failed: ${res.status} ${
            err.message ?? res.statusText
          } — path: ${filePath}`
        );
      }

      const data = (await res.json()) as GitHubPutResponse;
      return { relayedTo: data.commit.html_url };
    },
  };
}
