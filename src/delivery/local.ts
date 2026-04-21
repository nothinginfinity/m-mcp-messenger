/**
 * Local delivery — same-device message passing.
 * Default delivery path. No network. No relay. No cost.
 *
 * In v1, local delivery means writing to the recipient's inbox
 * on the same MessageStore instance. Host apps with multiple
 * agents on one device share a store instance to enable this.
 */

import type { SignedEnvelope, MessageStore, StoredMessage } from '../types/index.js';
import { verifyEnvelope } from '../envelope/index.js';

export interface LocalDeliveryResult {
  success: boolean;
  messageId: string;
  reason?: string;
}

/**
 * Deliver a SignedEnvelope to a local MessageStore.
 *
 * Steps:
 * 1. Verify the envelope signature
 * 2. Write to store as inbound message
 * 3. Return delivery result
 *
 * Verification failure = delivery rejected.
 * The store is the recipient's inbox.
 */
export async function deliverLocal(
  envelope: SignedEnvelope,
  recipientStore: MessageStore
): Promise<LocalDeliveryResult> {
  // Always verify before accepting
  const verification = verifyEnvelope(envelope);
  if (!verification.valid) {
    return {
      success: false,
      messageId: envelope.id,
      reason: `Signature verification failed: ${verification.reason ?? 'unknown'}`,
    };
  }

  const stored: StoredMessage = {
    envelope,
    status: 'delivered',
    updatedAt: new Date().toISOString(),
    direction: 'inbound',
  };

  await recipientStore.put(stored);

  return {
    success: true,
    messageId: envelope.id,
  };
}

/**
 * Record a sent message in the sender's outbox.
 * Call this after createSignedEnvelope, before delivery.
 */
export async function recordOutbound(
  envelope: SignedEnvelope,
  senderStore: MessageStore
): Promise<void> {
  const stored: StoredMessage = {
    envelope,
    status: 'pending',
    updatedAt: new Date().toISOString(),
    direction: 'outbound',
  };
  await senderStore.put(stored);
}

/**
 * Mark an outbound message as delivered in the sender's outbox.
 */
export async function confirmDelivery(
  messageId: string,
  senderStore: MessageStore
): Promise<void> {
  await senderStore.updateStatus(messageId, 'delivered');
}
