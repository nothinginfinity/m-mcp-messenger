/**
 * GitHubSpacesTransport tests.
 * Uses a mock fetch to avoid real GitHub API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGitHubSpacesTransport } from '../../src/delivery/transports/github-spaces.js';
import { generateKeypair } from '../../src/identity/index.js';
import { createSignedEnvelope } from '../../src/envelope/index.js';
import type { MessagePayload } from '../../src/types/index.js';

const payload: MessagePayload = {
  content: 'Relay via GitHub spaces',
  contentType: 'text/plain',
  subject: 'GitHub relay test',
};

const BASE_CONFIG = {
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: 'ghp_test_token',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createGitHubSpacesTransport', () => {
  it('creates new inbox file when none exists', async () => {
    const sender = generateKeypair('alice.mmcp');
    const recipient = generateKeypair('bob.mmcp');
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ status: 404, ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ commit: { html_url: 'https://github.com/commit/abc123' } }),
      })
    );

    const transport = createGitHubSpacesTransport(BASE_CONFIG);
    const result = await transport.send(env);

    expect(result.success).toBe(true);
    expect(result.relayedTo).toContain('github.com');
  });

  it('appends to existing inbox file', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );

    const existingContent = Buffer.from('# Inbox\n\nsome previous content\n', 'utf-8').toString('base64');

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          content: existingContent,
          sha: 'existing_sha_abc',
          html_url: 'https://github.com/blob/main/spaces/inbox.md',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ commit: { html_url: 'https://github.com/commit/def456' } }),
      })
    );

    const transport = createGitHubSpacesTransport(BASE_CONFIG);
    const result = await transport.send(env);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe(env.id);
  });

  it('respects custom resolveInboxPath', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );

    let capturedPath = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      capturedPath = url;
      if (url.includes('contents/')) {
        return Promise.resolve({ status: 404, ok: false, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ commit: { html_url: 'https://github.com/commit/xyz' } }),
      });
    }));

    const transport = createGitHubSpacesTransport({
      ...BASE_CONFIG,
      resolveInboxPath: (addr) => `agents/${addr}/messages.md`,
    });

    await transport.send(env);
    expect(capturedPath).toContain('agents/');
    expect(capturedPath).toContain('messages.md');
  });

  it('returns failure on GitHub API error', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      statusText: 'Unauthorized',
      text: async () => 'Bad credentials',
    }));

    const transport = createGitHubSpacesTransport(BASE_CONFIG);
    const result = await transport.send(env);

    expect(result.success).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
