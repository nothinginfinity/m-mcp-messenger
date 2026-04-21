import { describe, it, expect } from 'vitest';
import { generateKeypair } from '../src/identity/index.js';
import { createSignedEnvelope } from '../src/envelope/index.js';
import { mintCognitiveWorkToken, attachToken, deriveTokenId } from '../src/token/index.js';
import type { MessagePayload } from '../src/types/index.js';

const payload: MessagePayload = {
  content: 'Cognitive work test',
  contentType: 'text/plain',
};

describe('mintCognitiveWorkToken', () => {
  it('mints a token with correct provenance fields', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const token = await mintCognitiveWorkToken(env, sender.privateKey);
    expect(token.mintedBy).toBe(sender.address);
    expect(token.envelopeId).toBe(env.id);
    expect(token.tokenId).toBeTruthy();
    expect(token.proof).toBeTruthy();
    expect(token.mintedAt).toBeTruthy();
  });

  it('derives deterministic tokenId from same inputs', () => {
    const id1 = deriveTokenId('env_1', '0xabc', '2026-01-01T00:00:00.000Z');
    const id2 = deriveTokenId('env_1', '0xabc', '2026-01-01T00:00:00.000Z');
    expect(id1).toBe(id2);
  });

  it('produces different tokenIds for different envelopes', () => {
    const id1 = deriveTokenId('env_1', '0xabc', '2026-01-01T00:00:00.000Z');
    const id2 = deriveTokenId('env_2', '0xabc', '2026-01-01T00:00:00.000Z');
    expect(id1).not.toBe(id2);
  });
});

describe('attachToken', () => {
  it('attaches token to envelope without mutation', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const env = await createSignedEnvelope(
      sender.address, recipient.address, payload, sender.privateKey
    );
    const token = await mintCognitiveWorkToken(env, sender.privateKey);
    const withToken = attachToken(env, token);
    expect(withToken.cognitiveWorkToken).toEqual(token);
    expect(env.cognitiveWorkToken).toBeUndefined();
  });
});
