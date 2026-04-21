import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeypair } from '../src/identity/index.js';
import { createSignedEnvelope } from '../src/envelope/index.js';
import { InMemoryMessageStore } from '../src/store/index.js';
import type { StoredMessage, MessagePayload } from '../src/types/index.js';

const payload: MessagePayload = { content: 'Store test', contentType: 'text/plain' };

let store: InMemoryMessageStore;

beforeEach(() => { store = new InMemoryMessageStore(); });

async function makeStored(
  direction: 'inbound' | 'outbound'
): Promise<StoredMessage> {
  const sender = generateKeypair();
  const recipient = generateKeypair();
  const envelope = await createSignedEnvelope(
    sender.address, recipient.address, payload, sender.privateKey
  );
  return {
    envelope,
    status: 'pending',
    updatedAt: new Date().toISOString(),
    direction,
  };
}

describe('InMemoryMessageStore', () => {
  it('puts and gets a message', async () => {
    const msg = await makeStored('outbound');
    await store.put(msg);
    const retrieved = await store.get(msg.envelope.id);
    expect(retrieved?.envelope.id).toBe(msg.envelope.id);
  });

  it('lists inbox and outbox separately', async () => {
    const inbound = await makeStored('inbound');
    const outbound = await makeStored('outbound');
    await store.put(inbound);
    await store.put(outbound);
    const inbox = await store.listInbox();
    const outbox = await store.listOutbox();
    expect(inbox).toHaveLength(1);
    expect(outbox).toHaveLength(1);
    expect(inbox[0].direction).toBe('inbound');
    expect(outbox[0].direction).toBe('outbound');
  });

  it('updates message status', async () => {
    const msg = await makeStored('inbound');
    await store.put(msg);
    await store.updateStatus(msg.envelope.id, 'read');
    const updated = await store.get(msg.envelope.id);
    expect(updated?.status).toBe('read');
  });

  it('returns null for unknown id', async () => {
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });
});
