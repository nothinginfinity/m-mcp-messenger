import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGitHubMessageTransport } from '../../src/delivery/transports/github-message.js';
import { generateKeypair } from '../../src/identity/index.js';
import { createSignedEnvelope } from '../../src/envelope/index.js';

const BASE_CONFIG = {
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: 'ghp_test',
};

beforeEach(() => vi.restoreAllMocks());

describe('GitHubMessageTransport', () => {
  it('canDeliver always returns true', async () => {
    const transport = createGitHubMessageTransport(BASE_CONFIG);
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'hi', contentType: 'text/plain' },
      sender.privateKey
    );
    expect(await transport.canDeliver(env)).toBe(true);
  });

  it('delivers via single PUT — no GET required', async () => {
    const putCalls: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      expect(opts.method).toBe('PUT');
      putCalls.push(url as string);
      return {
        ok: true,
        json: async () => ({ commit: { html_url: 'https://github.com/mock/commit/abc' } }),
      };
    }));

    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'single PUT test', contentType: 'text/plain' },
      sender.privateKey
    );

    const transport = createGitHubMessageTransport(BASE_CONFIG);
    const result = await transport.deliver(env);

    expect(putCalls).toHaveLength(1); // exactly one API call
    expect(result.relayedTo).toBe('https://github.com/mock/commit/abc');
  });

  it('file path is derived from message id', async () => {
    let capturedUrl = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url as string;
      return {
        ok: true,
        json: async () => ({ commit: { html_url: 'https://github.com/x' } }),
      };
    }));

    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'path test', contentType: 'text/plain' },
      sender.privateKey
    );

    const transport = createGitHubMessageTransport(BASE_CONFIG);
    await transport.deliver(env);

    // Path should be spaces/{to}/messages/{id}.json
    expect(capturedUrl).toContain(`spaces/${recipient.address}/messages/`);
    expect(capturedUrl).toContain('.json');
  });

  it('throws on API error with descriptive message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ message: 'sha does not match' }),
    }));

    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'error test', contentType: 'text/plain' },
      sender.privateKey
    );

    const transport = createGitHubMessageTransport(BASE_CONFIG);
    await expect(transport.deliver(env)).rejects.toThrow('422');
  });

  it('respects custom resolveMessagesPath', async () => {
    let capturedUrl = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url as string;
      return {
        ok: true,
        json: async () => ({ commit: { html_url: 'https://github.com/x' } }),
      };
    }));

    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'custom path', contentType: 'text/plain' },
      sender.privateKey
    );

    const transport = createGitHubMessageTransport({
      ...BASE_CONFIG,
      resolveMessagesPath: (addr) => `custom/inbox/${addr}`,
    });
    await transport.deliver(env);

    expect(capturedUrl).toContain(`custom/inbox/${recipient.address}`);
  });
});
