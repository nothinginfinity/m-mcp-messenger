/**
 * SignedEnvelope creation and signing.
 * Uses EIP-191 personal_sign via ethers.js.
 */

import { Wallet, id as ethersId } from 'ethers';
import type { SignedEnvelope, MessagePayload } from '../types/index.js';

let _counter = 0;
function generateId(): string {
  _counter += 1;
  return `msg_${Date.now()}_${_counter}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Canonical string representation of an envelope for signing.
 * Deterministic — same inputs always produce same string.
 */
export function canonicalizeEnvelope(
  id: string,
  from: string,
  to: string,
  payload: MessagePayload,
  sentAt: string
): string {
  return JSON.stringify({ id, from, to, payload, sentAt });
}

/**
 * Create and sign a new SignedEnvelope.
 * Signs the canonical envelope string using EIP-191.
 */
export async function createSignedEnvelope(
  from: string,
  to: string,
  payload: MessagePayload,
  privateKey: string,
  threadId?: string
): Promise<SignedEnvelope> {
  const id = generateId();
  const sentAt = new Date().toISOString();
  const wallet = new Wallet(privateKey);
  const canonical = canonicalizeEnvelope(id, from, to, payload, sentAt);
  const signature = await wallet.signMessage(canonical);

  return {
    id,
    from,
    to,
    payload,
    sentAt,
    signature,
    ...(threadId ? { threadId } : {}),
  };
}
