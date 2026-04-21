/**
 * Identity types for m-mcp-messenger.
 * Every agent has an Ethereum-style address derived from an on-device keypair.
 */

export interface AgentKeypair {
  /** Ethereum-style 0x address derived from public key */
  address: string;
  /** Human-readable PIN in the form name.mmcp */
  pin: string | null;
  /** Private key hex — never leaves the device */
  privateKey: string;
  /** Public key hex */
  publicKey: string;
  /** ISO timestamp of key generation */
  createdAt: string;
}

export interface AgentIdentity {
  /** Ethereum-style 0x address */
  address: string;
  /** Human-readable PIN e.g. alice.mmcp */
  pin: string | null;
  /** Public key hex only — safe to share */
  publicKey: string;
  /** ISO timestamp */
  createdAt: string;
}

/** Resolve a .mmcp PIN or 0x address to a canonical 0x address */
export type AddressResolver = (pinOrAddress: string) => Promise<string | null>;
