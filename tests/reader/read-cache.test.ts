import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGitHubReadCache, createInMemoryReadCache } from '../../src/reader/read-cache.js';

const BASE_CONFIG = {
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: 'ghp_test',
};

beforeEach(() => vi.restoreAllMocks());

// ─── InMemoryReadCache ───────────────────────────────────────────────────────

describe('InMemoryReadCache', () => {
  it('returns empty set on first load', async () => {
    const cache = createInMemoryReadCache();
    const ids = await cache.load('0xALICE');
    expect(ids.size).toBe(0);
  });

  it('persists IDs after save', async () => {
    const cache = createInMemoryReadCache();
    const ids = new Set(['msg_001', 'msg_002']);
    await cache.save('0xALICE', ids);
    const loaded = await cache.load('0xALICE');
    expect(loaded).toEqual(ids);
  });

  it('is isolated per address', async () => {
    const cache = createInMemoryReadCache();
    await cache.save('0xALICE', new Set(['a']));
    await cache.save('0xBOB', new Set(['b']));
    expect(await cache.load('0xALICE')).toEqual(new Set(['a']));
    expect(await cache.load('0xBOB')).toEqual(new Set(['b']));
  });
});

// ─── GitHubReadCache ────────────────────────────────────────────────────────

describe('GitHubReadCache', () => {
  it('returns empty set when cache file does not exist (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 404, ok: false, json: async () => ({}),
    }));
    const cache = createGitHubReadCache(BASE_CONFIG);
    const ids = await cache.load('0xALICE');
    expect(ids.size).toBe(0);
  });

  it('loads existing IDs from GitHub', async () => {
    const ids = ['msg_001', 'msg_002', 'msg_003'];
    const content = Buffer.from(JSON.stringify(ids), 'utf-8').toString('base64');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content, sha: 'abc123' }),
    }));
    const cache = createGitHubReadCache(BASE_CONFIG);
    const loaded = await cache.load('0xALICE');
    expect(loaded).toEqual(new Set(ids));
  });

  it('creates new cache file when none exists (no sha in PUT body)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ status: 404, ok: false, json: async () => ({}) }) // load → miss
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: { sha: 'new_sha' } }),
      }) // save → create
    );
    const cache = createGitHubReadCache(BASE_CONFIG);
    await cache.load('0xALICE');
    const ids = new Set(['msg_001']);
    await cache.save('0xALICE', ids); // should PUT without sha
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const putBody = JSON.parse(calls[1][1].body as string);
    expect(putBody.sha).toBeUndefined();
  });

  it('includes sha in PUT body when updating existing cache', async () => {
    const content = Buffer.from(JSON.stringify(['msg_001']), 'utf-8').toString('base64');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content, sha: 'existing_sha' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: { sha: 'new_sha' } }) })
    );
    const cache = createGitHubReadCache(BASE_CONFIG);
    await cache.load('0xALICE');
    await cache.save('0xALICE', new Set(['msg_001', 'msg_002']));
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const putBody = JSON.parse(calls[1][1].body as string);
    expect(putBody.sha).toBe('existing_sha');
  });
});
