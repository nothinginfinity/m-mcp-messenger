/**
 * .mmcp PIN resolver.
 * v1: local-only resolution via a simple in-memory registry.
 * Future: distributed resolution without a central server.
 */

import type { AddressResolver } from '../types/index.js';
import { isValidAddress, isValidPin } from './keypair.js';

export type PinRegistry = Map<string, string>; // pin -> address

/**
 * Create a local PIN resolver backed by an in-memory registry.
 * In a host app, back this with IndexedDB or secure device storage.
 */
export function createLocalResolver(registry: PinRegistry): AddressResolver {
  return async (pinOrAddress: string): Promise<string | null> => {
    // Already a valid 0x address
    if (isValidAddress(pinOrAddress)) return pinOrAddress;

    // .mmcp PIN lookup
    if (isValidPin(pinOrAddress)) {
      return registry.get(pinOrAddress) ?? null;
    }

    return null;
  };
}

/**
 * Register a PIN -> address mapping in the local registry.
 */
export function registerPin(
  registry: PinRegistry,
  pin: string,
  address: string
): void {
  if (!isValidPin(pin)) throw new Error(`Invalid .mmcp PIN: ${pin}`);
  if (!isValidAddress(address)) throw new Error(`Invalid address: ${address}`);
  registry.set(pin, address);
}
