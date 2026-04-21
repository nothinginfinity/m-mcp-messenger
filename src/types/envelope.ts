/**
 * SignedEnvelope — a standard m-mcp ContextEnvelope extended with
 * cryptographic signature for provenance and authenticity.
 */

export interface MessagePayload {
  /** Arbitrary content — text, structured data, capability result */
  content: string;
  /** Optional MIME hint */
  contentType?: string;
  /** Optional subject line (email metaphor) */
  subject?: string;
}

export interface SignedEnvelope {
  /** Unique message ID */
  id: string;
  /** Sender 0x address */
  from: string;
  /** Recipient 0x address */
  to: string;
  /** Message payload */
  payload: MessagePayload;
  /** ISO timestamp of creation */
  sentAt: string;
  /** EIP-191 signature of canonical envelope hash */
  signature: string;
  /** Optional thread ID for reply chains */
  threadId?: string;
  /** Optional cognitive work token attached to this message */
  cognitiveWorkToken?: CognitiveWorkToken;
}

/**
 * CognitiveWorkToken — proof of origin.
 * Proves a message was created by a specific agent,
 * on a specific device, at a specific time.
 * No monetary value. Testnet only. Provenance only.
 */
export interface CognitiveWorkToken {
  /** Token ID — hash of envelope id + sender + sentAt */
  tokenId: string;
  /** Sender address that minted this token */
  mintedBy: string;
  /** ISO timestamp of minting */
  mintedAt: string;
  /** The envelope ID this token proves */
  envelopeId: string;
  /** EIP-191 signature of tokenId by sender private key */
  proof: string;
}
