/**
 * In-memory MessageStore implementation.
 * Drop-in for development and testing.
 * Host apps should back this with IndexedDB or secure device storage.
 */

import type { MessageStore, StoredMessage, MessageStatus } from '../types/index.js';

export class InMemoryMessageStore implements MessageStore {
  private readonly messages = new Map<string, StoredMessage>();

  async put(message: StoredMessage): Promise<void> {
    this.messages.set(message.envelope.id, message);
  }

  async get(id: string): Promise<StoredMessage | null> {
    return this.messages.get(id) ?? null;
  }

  async listInbox(): Promise<StoredMessage[]> {
    return [...this.messages.values()]
      .filter((m) => m.direction === 'inbound')
      .sort((a, b) => a.envelope.sentAt.localeCompare(b.envelope.sentAt));
  }

  async listOutbox(): Promise<StoredMessage[]> {
    return [...this.messages.values()]
      .filter((m) => m.direction === 'outbound')
      .sort((a, b) => a.envelope.sentAt.localeCompare(b.envelope.sentAt));
  }

  async updateStatus(id: string, status: MessageStatus): Promise<void> {
    const msg = this.messages.get(id);
    if (!msg) throw new Error(`Message not found: ${id}`);
    this.messages.set(id, { ...msg, status, updatedAt: new Date().toISOString() });
  }

  /** Utility: total message count */
  get size(): number {
    return this.messages.size;
  }

  /** Utility: clear all messages (test helper) */
  clear(): void {
    this.messages.clear();
  }
}
