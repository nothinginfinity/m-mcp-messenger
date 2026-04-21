/**
 * Local message store types.
 * Inbox and outbox live on-device. No remote required.
 */

import type { SignedEnvelope } from './envelope.js';

export type MessageStatus = 'pending' | 'delivered' | 'failed' | 'read';

export interface StoredMessage {
  envelope: SignedEnvelope;
  status: MessageStatus;
  /** ISO timestamp of last status change */
  updatedAt: string;
  /** Direction from this device's perspective */
  direction: 'inbound' | 'outbound';
}

export interface MessageStore {
  put(message: StoredMessage): Promise<void>;
  get(id: string): Promise<StoredMessage | null>;
  listInbox(): Promise<StoredMessage[]>;
  listOutbox(): Promise<StoredMessage[]>;
  updateStatus(id: string, status: MessageStatus): Promise<void>;
}
