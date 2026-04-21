import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeypair } from '../src/identity/index.js';
import { createSignedEnvelope } from '../src/envelope/index.js';
import { InMemoryMessageStore } from '../src/store/index.js';
import {
  deliverLocal,
  recordOutbound,
  confirmDelivery,
  relayDeliver,
  noopRelayTransport,
} from '../src/delivery/index.js';
import type { MessagePayload, RelayTransport, SignedEnvelope, RelayResult } from '../src/types/index.js';

const payload: MessagePayload = {
  content: 'Delivery test message',
  contentType: 'text/plain',
  subject: 'Test',
};

let senderStore: InMemoryMessageStore;
let recipientStore: InMemoryMessageStore;

beforeEach(() => {
  senderStore = new InMemoryMessageStore();
  recipientStore = new InMemoryMessageStore();
});

describe('deliverLocal', () => {
  it('delivers a valid envelope to recipient inbox', async () => {
    const sender = generateKeypair('alice.mmcp');
    const recipient = generateKeypair('bob.mmcp');
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const result = await deliverLocal(env, recipientStore);
    expect(result.success).toBe(true);
    expect(result.messageId).toBe(env.id);
    const inbox = await recipientStore.listInbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].status).toBe('delivered');
  });

  it('rejects a tampered envelope', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const tampered = { ...env, payload: { ...env.payload, content: 'HACKED' } };
    const result = await deliverLocal(tampered, recipientStore);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Signature verification failed');
    const inbox = await recipientStore.listInbox();
    expect(inbox).toHaveLength(0);
  });
});

describe('recordOutbound + confirmDelivery', () => {
  it('records pending outbound and confirms delivery', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    await recordOutbound(env, senderStore);
    const outbox = await senderStore.listOutbox();
    expect(outbox[0].status).toBe('pending');
    await confirmDelivery(env.id, senderStore);
    const updated = await senderStore.get(env.id);
    expect(updated?.status).toBe('delivered');
  });
});

describe('relayDeliver', () => {
  it('blocks relay when policy disallows remote', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const result = await relayDeliver(env, { allowRemote: false });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('blocked by policy');
  });

  it('blocks relay when device is offline', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const result = await relayDeliver(
      env,
      { allowRemote: true, isConnected: () => false }
    );
    expect(result.success).toBe(false);
    expect(result.reason).toContain('offline');
  });

  it('uses noop transport when none configured', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const result = await relayDeliver(
      env,
      { allowRemote: true, isConnected: () => true },
      noopRelayTransport
    );
    expect(result.success).toBe(false);
    expect(result.reason).toContain('No relay transport configured');
  });

  it('succeeds with a custom transport', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const mockTransport: RelayTransport = {
      async send(e: SignedEnvelope): Promise<RelayResult> {
        return { success: true, messageId: e.id, relayedTo: 'mock-relay' };
      },
    };
    const result = await relayDeliver(
      env,
      { allowRemote: true, isConnected: () => true },
      mockTransport
    );
    expect(result.success).toBe(true);
    expect(result.relayedTo).toBe('mock-relay');
  });
});
