import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGitHubMessageReader } from '../../src/reader/github-message-reader.js';
import { createInMemoryReadCache } from '../../src/reader/read-cache.js';
import { generateKeypair } from '../../src/identity/index.js';
import { createSignedEnvelope } from '../../src/envelope/index.js';
import { InMemoryMessageStore } from '../../src/store/index.js';

const BASE_CONFIG = {
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: 'ghp_test',
};

beforeEach(() => vi.restoreAllMocks());

function makeFileResponse(envelope: object) {
  const content = Buffer.from(JSON.stringify(envelope, null, 2), 'utf-8').toString('base64');
  return { ok: true, status: 200, json: async () => ({ content, sha: 'abc' }) };
}

function makeTreeResponse(paths: string[]) {
  return {
    ok: true,
    json: async () => ({
      tree: paths.map(path => ({ type: 'blob', path, sha: 'abc', url: '' })),
      truncated: false,
    }),
  };
}

function makeRefResponse(sha = 'commit_sha_001') {
  return { ok: true, json: async () => ({ object: { sha } }) };
}

describe('GitHubMessageReader (v2 — Tree API + ReadCache)', () => {
  it('warm poll with cache — 2 API calls when no new messages', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'warm test', contentType: 'text/plain' },
      sender.privateKey
    );

    const path = `spaces/${recipient.address}/messages/${env.id}.json`;
    const cache = createInMemoryReadCache();
    await cache.save(recipient.address, new Set([env.id])); // pre-warm

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeRefResponse())          // ref lookup
      .mockResolvedValueOnce(makeTreeResponse([path]));  // tree fetch
    vi.stubGlobal('fetch', fetchMock);

    const store = new InMemoryMessageStore();
    const reader = createGitHubMessageReader({ ...BASE_CONFIG, readCache: cache });
    const result = await reader.poll(recipient.address, store);

    // ref + tree = 2, cache.load is in-memory (0 calls), no file fetches
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.skipped).toBe(1);
    expect(result.ingested).toBe(0);
    expect(result.apiCalls).toBe(3); // 2 tree + 1 cache load (counted internally)
  });

  it('cold poll — fetches new messages, saves cache after ingest', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'cold test', contentType: 'text/plain' },
      sender.privateKey
    );

    const path = `spaces/${recipient.address}/messages/${env.id}.json`;
    const cache = createInMemoryReadCache(); // empty cache

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeRefResponse())
      .mockResolvedValueOnce(makeTreeResponse([path]))
      .mockResolvedValueOnce(makeFileResponse(env));
    vi.stubGlobal('fetch', fetchMock);

    const store = new InMemoryMessageStore();
    const reader = createGitHubMessageReader({ ...BASE_CONFIG, readCache: cache });
    const result = await reader.poll(recipient.address, store);

    expect(result.ingested).toBe(1);
    expect(result.found).toBe(1);
    expect(result.skipped).toBe(0);

    // Cache should now contain the ingested ID
    const cached = await cache.load(recipient.address);
    expect(cached.has(env.id)).toBe(true);
  });

  it('second poll is fully warm — no file fetches', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'repeat poll', contentType: 'text/plain' },
      sender.privateKey
    );

    const path = `spaces/${recipient.address}/messages/${env.id}.json`;
    const cache = createInMemoryReadCache();

    const fetchMock = vi.fn()
      // First poll: ref + tree + file
      .mockResolvedValueOnce(makeRefResponse())
      .mockResolvedValueOnce(makeTreeResponse([path]))
      .mockResolvedValueOnce(makeFileResponse(env))
      // Second poll: ref + tree only (message now in cache)
      .mockResolvedValueOnce(makeRefResponse())
      .mockResolvedValueOnce(makeTreeResponse([path]));
    vi.stubGlobal('fetch', fetchMock);

    const store = new InMemoryMessageStore();
    const reader = createGitHubMessageReader({ ...BASE_CONFIG, readCache: cache });

    await reader.poll(recipient.address, store);  // cold
    const second = await reader.poll(recipient.address, store); // warm

    expect(second.skipped).toBe(1);
    expect(second.ingested).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(5); // 3 + 2
  });

  it('rejects tampered envelope', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'real', contentType: 'text/plain' },
      sender.privateKey
    );
    const tampered = { ...env, payload: { ...env.payload, content: 'HACKED' } };
    const path = `spaces/${recipient.address}/messages/${env.id}.json`;

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(makeRefResponse())
      .mockResolvedValueOnce(makeTreeResponse([path]))
      .mockResolvedValueOnce(makeFileResponse(tampered))
    );

    const store = new InMemoryMessageStore();
    const reader = createGitHubMessageReader({ ...BASE_CONFIG, readCache: createInMemoryReadCache() });
    const result = await reader.poll(recipient.address, store);

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('Signature invalid');
  });
});
