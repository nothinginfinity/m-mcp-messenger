import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createGitHubSpacesReader,
  parseEnvelopeBlocks,
  parseEnvelope,
} from '../../src/reader/github-spaces-reader.js';
import { generateKeypair } from '../../src/identity/index.js';
import { createSignedEnvelope } from '../../src/envelope/index.js';
import { InMemoryMessageStore } from '../../src/store/index.js';
import type { MessagePayload } from '../../src/types/index.js';

const payload: MessagePayload = {
  content: 'Hello from alice',
  contentType: 'text/plain',
  subject: 'Reader test',
};

const BASE_CONFIG = {
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: 'ghp_test_token',
};

beforeEach(() => vi.restoreAllMocks());

// ─── parseEnvelopeBlocks ───────────────────────────────────────────────

describe('parseEnvelopeBlocks', () => {
  it('extracts one block from markdown', () => {
    const md = '# Inbox\n\n```json\n{"id":"msg_1"}\n```\n';
    const blocks = parseEnvelopeBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('msg_1');
  });

  it('extracts multiple blocks', () => {
    const md = '```json\n{"id":"a"}\n```\n\n```json\n{"id":"b"}\n```\n';
    const blocks = parseEnvelopeBlocks(md);
    expect(blocks).toHaveLength(2);
  });

  it('returns empty array when no blocks found', () => {
    const blocks = parseEnvelopeBlocks('# Empty inbox\n');
    expect(blocks).toHaveLength(0);
  });
});

// ─── parseEnvelope ────────────────────────────────────────────────────

describe('parseEnvelope', () => {
  it('parses a valid envelope JSON string', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const parsed = parseEnvelope(JSON.stringify(env));
    expect(parsed.id).toBe(env.id);
    expect(parsed.from).toBe(env.from);
  });

  it('throws on missing required field', () => {
    const bad = JSON.stringify({ id: 'x', from: '0xabc' });
    expect(() => parseEnvelope(bad)).toThrow('Missing required field');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseEnvelope('not json')).toThrow();
  });
});

// ─── poll ─────────────────────────────────────────────────────────────

describe('poll', () => {
  it('returns zero results when inbox does not exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 404, ok: false, json: async () => ({}),
    }));
    const store = new InMemoryMessageStore();
    const reader = createGitHubSpacesReader(BASE_CONFIG);
    const result = await reader.poll('0xRECIPIENT', store);
    expect(result.found).toBe(0);
    expect(result.ingested).toBe(0);
  });

  it('ingests a valid signed envelope from inbox', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const inboxContent = `# Inbox\n\n\`\`\`json\n${JSON.stringify(env, null, 2)}\n\`\`\`\n`;
    const encoded = Buffer.from(inboxContent, 'utf-8').toString('base64');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({ content: encoded, sha: 'abc123' }),
    }));

    const store = new InMemoryMessageStore();
    const reader = createGitHubSpacesReader(BASE_CONFIG);
    const result = await reader.poll(recipient.address, store);

    expect(result.found).toBe(1);
    expect(result.ingested).toBe(1);
    expect(result.rejected).toHaveLength(0);
    const inbox = await store.listInbox();
    expect(inbox[0].envelope.id).toBe(env.id);
  });

  it('rejects a tampered envelope', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const tampered = { ...env, payload: { ...env.payload, content: 'HACKED' } };
    const inboxContent = `# Inbox\n\n\`\`\`json\n${JSON.stringify(tampered, null, 2)}\n\`\`\`\n`;
    const encoded = Buffer.from(inboxContent, 'utf-8').toString('base64');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({ content: encoded, sha: 'abc123' }),
    }));

    const store = new InMemoryMessageStore();
    const reader = createGitHubSpacesReader(BASE_CONFIG);
    const result = await reader.poll(recipient.address, store);

    expect(result.found).toBe(1);
    expect(result.ingested).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('Signature invalid');
  });

  it('is idempotent — skips already-stored messages', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const inboxContent = `# Inbox\n\n\`\`\`json\n${JSON.stringify(env, null, 2)}\n\`\`\`\n`;
    const encoded = Buffer.from(inboxContent, 'utf-8').toString('base64');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({ content: encoded, sha: 'abc123' }),
    }));

    const store = new InMemoryMessageStore();
    const reader = createGitHubSpacesReader(BASE_CONFIG);

    await reader.poll(recipient.address, store);
    const second = await reader.poll(recipient.address, store);

    // Second poll: found=1 but ingested=0 because already stored
    expect(second.found).toBe(1);
    expect(second.ingested).toBe(0);
    expect(await store.listInbox()).toHaveLength(1);
  });
});
