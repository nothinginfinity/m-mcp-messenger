/**
 * Cognitive Work Token minting.
 * A signed receipt proving a message was created by a specific agent
 * on a specific device at a specific time.
 * No monetary value. Testnet only. Provenance only.
 */

import { Wallet, keccak256, toUtf8Bytes } from 'ethers';
import type { CognitiveWorkToken, SignedEnvelope } from '../types/index.js';

/**
 * Derive a deterministic token ID from envelope properties.
 */
export function deriveTokenId(
  envelopeId: string,
  mintedBy: string,
  mintedAt: string
): string {
  return keccak256(toUtf8Bytes(`${envelopeId}:${mintedBy}:${mintedAt}`));
}

/**
 * Mint a CognitiveWorkToken for a given SignedEnvelope.
 * The token proves the sender created this envelope at this time.
 */
export async function mintCognitiveWorkToken(
  envelope: SignedEnvelope,
  privateKey: string
): Promise<CognitiveWorkToken> {
  const mintedAt = new Date().toISOString();
  const tokenId = deriveTokenId(envelope.id, envelope.from, mintedAt);
  const wallet = new Wallet(privateKey);
  const proof = await wallet.signMessage(tokenId);

  return {
    tokenId,
    mintedBy: envelope.from,
    mintedAt,
    envelopeId: envelope.id,
    proof,
  };
}

/**
 * Attach a minted token to an existing SignedEnvelope.
 * Returns a new envelope object — does not mutate the original.
 */
export function attachToken(
  envelope: SignedEnvelope,
  token: CognitiveWorkToken
): SignedEnvelope {
  return { ...envelope, cognitiveWorkToken: token };
}
