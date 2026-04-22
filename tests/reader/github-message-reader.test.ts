import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGitHubMessageReader } from '../../src/reader/github-message-reader.js';
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
  return { ok: true, json: async () => ({ content, sha: 'abc' }) };
}

function makeDirResponse(names: string[]) {
  return {
    ok: true,
    json: async () => names.map(name => ({
      type: 'file',
      name,
      path: `spaces/0xBOB/messages/${name}`,
      sha: 'abc',
      download_url: null,
    })),
  };
}

describe('GitHubMessageReader', () => {
  it('returns zero results when directory does not exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }));
    const store = new InMemoryMessageStore();
    const reader = createGitHubMessageReader(BASE_CONFIG);
    const result = await reader.poll('0xBOB', store);
    expect(result.found).toBe(0);
    expect(result.ingested).toBe(0);
  });

  it('ingests a valid message — exactly 2 API calls (list + fetch)', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'hello', contentType: 'text/plain' },
      sender.privateKey
    );

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeDirResponse([`${env.id}.json`]))
      .mockResolvedValueOnce(makeFileResponse(env));

    vi.stubGlobal('fetch', fetchMock);

    const store = new InMemoryMessageStore();
    const reader = createGitHubMessageReader(BASE_CONFIG);
    const result = await reader.poll(recipient.address, store);

    expect(fetchMock).toHaveBeenCalledTimes(2); // list + 1 file
    expect(result.found).toBe(1);
    expect(result.ingested).toBe(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('skips already-stored messages without fetching their content', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'idempotent', contentType: 'text/plain' },
      sender.privateKey
    );

    // Pre-load the store
    const store = new InMemoryMessageStore();
    await store.put({ envelope: env, status: 'delivered', updatedAt: new Date().toISOString(), direction: 'inbound' });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeDirResponse([`${env.id}.json`]));
    vi.stubGlobal('fetch', fetchMock);

    const reader = createGitHubMessageReader(BASE_CONFIG);
    const result = await reader.poll(recipient.address, store);

    expect(fetchMock).toHaveBeenCalledTimes(1); // list only — no file fetch
    expect(result.skipped).toBe(1);
    expect(result.ingested).toBe(0);
  });

  it('rejects tampered envelope without storing it', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address,
      { content: 'legit', contentType: 'text/plain' },
      sender.privateKey
    );
    const tampered = { ...env, payload: { ...env.payload, content: 'HACKED' } };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeDirResponse([`${env.id}.json`]))
      .mockResolvedValueOnce(makeFileResponse(tampered));
    vi.stubGlobal('fetch', fetchMock);

    const store = new InMemoryMessageStore();
    const reader = createGitHubMessageReader(BASE_CONFIG);
    const result = await reader.poll(recipient.address, store);

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('Signature invalid');
    expect(await store.listInbox()).toHaveLength(0);
  });

  it('fetches multiple new messages in parallel batches', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const envs = await Promise.all(
      [1,2,3].map(i => createSignedEnvelope(
        sender.address, recipient.address,
        { content: `msg ${i}`, contentType: 'text/plain' },
        sender.privateKey
      ))
    );

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeDirResponse(envs.map(e => `${e.id}.json`)))
      .mockResolvedValueOnce(makeFileResponse(envs[0]))
      .mockResolvedValueOnce(makeFileResponse(envs[1]))
      .mockResolvedValueOnce(makeFileResponse(envs[2]));
    vi.stubGlobal('fetch', fetchMock);

    const store = new InMemoryMessageStore();
    const reader = createGitHubMessageReader(BASE_CONFIG);
    const result = await reader.poll(recipient.address, store);

    expect(result.found).toBe(3);
    expect(result.ingested).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 list + 3 files
  });
});
