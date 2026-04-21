/**
 * Remote relay — optional, policy-gated delivery to a remote recipient.
 *
 * This is a STUB in v1. Remote relay is never required.
 * It is only attempted when:
 *   1. Local delivery is not possible (recipient not on same device)
 *   2. The execution policy permits remote calls
 *   3. Connectivity is available
 *
 * The relay interface is intentionally minimal so host apps can
 * plug in any transport: HTTP, WebSocket, IPFS, or a custom relay.
 */

import type { SignedEnvelope } from '../types/index.js';

export interface RelayPolicy {
  /** Whether remote relay is permitted at all */
  allowRemote: boolean;
  /** Optional connectivity check — relay skipped if returns false */
  isConnected?: () => boolean | Promise<boolean>;
  /** Optional timeout in ms for relay attempt */
  timeoutMs?: number;
}

export interface RelayResult {
  success: boolean;
  messageId: string;
  relayedTo?: string;
  reason?: string;
}

/**
 * Relay transport interface.
 * Host apps implement this to plug in their delivery mechanism.
 * Examples: HTTP POST to a relay server, write to a shared IPFS node,
 * append to a GitHub file (like the existing spaces/inbox.md pattern).
 */
export interface RelayTransport {
  send(envelope: SignedEnvelope): Promise<RelayResult>;
}

/**
 * Default no-op relay transport.
 * Used when no transport is configured.
 * Always returns success=false with a clear reason.
 */
export const noopRelayTransport: RelayTransport = {
  async send(envelope: SignedEnvelope): Promise<RelayResult> {
    return {
      success: false,
      messageId: envelope.id,
      reason: 'No relay transport configured. Plug in a RelayTransport to enable remote delivery.',
    };
  },
};

/**
 * Attempt remote relay delivery.
 * Respects policy: if remote is not allowed or device is offline, returns early.
 *
 * @param envelope - The signed envelope to relay
 * @param policy - Relay policy controlling whether remote is permitted
 * @param transport - The relay transport to use (defaults to noop)
 */
export async function relayDeliver(
  envelope: SignedEnvelope,
  policy: RelayPolicy,
  transport: RelayTransport = noopRelayTransport
): Promise<RelayResult> {
  // Policy gate: remote not allowed
  if (!policy.allowRemote) {
    return {
      success: false,
      messageId: envelope.id,
      reason: 'Remote relay blocked by policy.',
    };
  }

  // Connectivity gate: check if online before attempting
  if (policy.isConnected) {
    const connected = await policy.isConnected();
    if (!connected) {
      return {
        success: false,
        messageId: envelope.id,
        reason: 'Remote relay skipped: device offline.',
      };
    }
  }

  // Attempt delivery with optional timeout
  if (policy.timeoutMs) {
    const timeout = new Promise<RelayResult>((resolve) =>
      setTimeout(
        () => resolve({ success: false, messageId: envelope.id, reason: 'Relay timeout.' }),
        policy.timeoutMs
      )
    );
    return Promise.race([transport.send(envelope), timeout]);
  }

  return transport.send(envelope);
}
