/**
 * GitHubSpacesTransport
 *
 * A real RelayTransport implementation that delivers messages by
 * appending signed envelopes to a GitHub file acting as an inbox.
 *
 * This mirrors the existing spaces/*/inbox.md pattern used in
 * Studio-OS-Chat and Studio-OS, making GitHub the async relay
 * layer between agents that are not on the same device.
 *
 * How it works:
 *   1. Fetch current inbox file content + SHA from GitHub API
 *   2. Append the serialized SignedEnvelope as a fenced JSON block
 *   3. Commit the update back to the repo
 *   4. Return a RelayResult with the commit URL as proof
 *
 * Security:
 *   The envelope is already signed by the sender (EIP-191).
 *   The GitHub commit provides a second layer of delivery proof.
 *   The recipient verifies the envelope signature on read —
 *   GitHub itself is not trusted for authenticity, only for transport.
 *
 * v1 constraints:
 *   - Requires a GitHub personal access token with repo write scope
 *   - One inbox file per recipient agent (path convention below)
 *   - Append-only: messages are never deleted by the transport
 */

import type { SignedEnvelope } from '../../types/index.js';
import type { RelayTransport, RelayResult } from '../relay.js';

export interface GitHubSpacesConfig {
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
  /**
   * Function that resolves a recipient address to an inbox file path.
   * Default: spaces/{address}/inbox.md
   * Override to match your repo's naming convention.
   */
  resolveInboxPath?: (recipientAddress: string) => string;
}

function defaultInboxPath(address: string): string {
  return `spaces/${address}/inbox.md`;
}

interface GitHubFileResponse {
  content: string;
  sha: string;
  html_url: string;
}

/**
 * Serialize a SignedEnvelope for appending to a markdown inbox file.
 * Wrapped in a fenced code block for readability and parseability.
 */
function serializeEnvelopeEntry(envelope: SignedEnvelope): string {
  const timestamp = new Date().toISOString();
  return [
    `\n<!-- m-mcp-messenger envelope ${envelope.id} delivered ${timestamp} -->`,
    '```json',
    JSON.stringify(envelope, null, 2),
    '```\n',
  ].join('\n');
}

/**
 * Create a GitHubSpacesTransport.
 * Returns a RelayTransport that delivers to GitHub-hosted inbox files.
 */
export function createGitHubSpacesTransport(
  config: GitHubSpacesConfig
): RelayTransport {
  const apiBase = config.apiBase ?? 'https://api.github.com';
  const branch = config.branch ?? 'main';
  const resolveInboxPath = config.resolveInboxPath ?? defaultInboxPath;

  async function fetchFile(
    path: string
  ): Promise<{ content: string; sha: string } | null> {
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
    const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content: decoded, sha: data.sha };
  }

  async function putFile(
    path: string,
    content: string,
    sha: string | null,
    message: string
  ): Promise<string> {
    const url = `${apiBase}/repos/${config.owner}/${config.repo}/contents/${path}`;
    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch,
    };
    if (sha) body.sha = sha;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitHub put failed: ${res.status} ${err}`);
    }
    const data = await res.json() as { commit: { html_url: string } };
    return data.commit.html_url;
  }

  return {
    async send(envelope: SignedEnvelope): Promise<RelayResult> {
      try {
        const inboxPath = resolveInboxPath(envelope.to);
        const existing = await fetchFile(inboxPath);
        const entry = serializeEnvelopeEntry(envelope);
        const newContent = existing
          ? existing.content + entry
          : `# Inbox\n${entry}`;
        const sha = existing?.sha ?? null;
        const commitUrl = await putFile(
          inboxPath,
          newContent,
          sha,
          `m-mcp-messenger: deliver ${envelope.id} from ${envelope.from}`
        );
        return {
          success: true,
          messageId: envelope.id,
          relayedTo: commitUrl,
        };
      } catch (err) {
        return {
          success: false,
          messageId: envelope.id,
          reason: err instanceof Error ? err.message : 'Unknown relay error',
        };
      }
    },
  };
}
