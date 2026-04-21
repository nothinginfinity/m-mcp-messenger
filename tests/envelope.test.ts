import { describe, it, expect } from 'vitest';
import { generateKeypair } from '../src/identity/index.js';
import {
  createSignedEnvelope,
  verifyEnvelope,
  canonicalizeEnvelope,
} from '../src/envelope/index.js';
import type { MessagePayload } from '../src/types/index.js';

const payload: MessagePayload = {
  content: 'Hello from agent alice',
  contentType: 'text/plain',
  subject: 'Test message',
};

describe('createSignedEnvelope', () => {
  it('creates a signed envelope with correct fields', async () => {
    const sender = generateKeypair('alice.mmcp');
    const recipient = generateKeypair('bob.mmcp');
    const env = await createSignedEnvelope(
      sender.address,
      recipient.address,
      payload,
      sender.privateKey
    );
    expect(env.from).toBe(sender.address);
    expect(env.to).toBe(recipient.address);
    expect(env.payload).toEqual(payload);
    expect(env.signature).toBeTruthy();
    expect(env.id).toBeTruthy();
    expect(env.sentAt).toBeTruthy();
  });

  it('generates unique IDs for each envelope', async () => {
    const kp = generateKeypair();
    const recipient = generateKeypair();
    const a = await createSignedEnvelope(kp.address, recipient.address, payload, kp.privateKey);
    const b = await createSignedEnvelope(kp.address, recipient.address, payload, kp.privateKey);
    expect(a.id).not.toBe(b.id);
  });

  it('attaches threadId when provided', async () => {
    const kp = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      kp.address, recipient.address, payload, kp.privateKey, 'thread_abc'
    );
    expect(env.threadId).toBe('thread_abc');
  });
});

describe('verifyEnvelope', () => {
  it('returns valid=true for a correctly signed envelope', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const result = verifyEnvelope(env);
    expect(result.valid).toBe(true);
    expect(result.recoveredAddress?.toLowerCase()).toBe(sender.address.toLowerCase());
  });

  it('returns valid=false if envelope is tampered', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const tampered = { ...env, payload: { ...env.payload, content: 'TAMPERED' } };
    const result = verifyEnvelope(tampered);
    expect(result.valid).toBe(false);
  });
});
