/**
 * SignedEnvelope verification.
 * Recovers signer address from EIP-191 signature and compares to envelope.from.
 */

import { verifyMessage } from 'ethers';
import type { SignedEnvelope } from '../types/index.js';
import { canonicalizeEnvelope } from './create.js';

export interface VerifyResult {
  valid: boolean;
  recoveredAddress: string | null;
  reason?: string;
}

/**
 * Verify a SignedEnvelope.
 * Returns valid=true only if recovered signer matches envelope.from.
 */
export function verifyEnvelope(envelope: SignedEnvelope): VerifyResult {
  try {
    const canonical = canonicalizeEnvelope(
      envelope.id,
      envelope.from,
      envelope.to,
      envelope.payload,
      envelope.sentAt
    );
    const recovered = verifyMessage(canonical, envelope.signature);
    const valid = recovered.toLowerCase() === envelope.from.toLowerCase();
    return {
      valid,
      recoveredAddress: recovered,
      ...(!valid ? { reason: 'Recovered address does not match envelope.from' } : {}),
    };
  } catch (err) {
    return {
      valid: false,
      recoveredAddress: null,
      reason: err instanceof Error ? err.message : 'Unknown verification error',
    };
  }
}
