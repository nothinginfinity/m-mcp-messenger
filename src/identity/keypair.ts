/**
 * On-device keypair generation using ethers.js.
 * Private key never leaves the device.
 * v1: no seed phrase, no recovery. Device-local only.
 */

import { Wallet } from 'ethers';
import type { AgentKeypair, AgentIdentity } from '../types/index.js';

/**
 * Generate a new agent keypair on-device.
 * Returns the full keypair including private key.
 * Store the private key securely in device keychain/secure storage.
 */
export function generateKeypair(pin: string | null = null): AgentKeypair {
  const wallet = Wallet.createRandom();
  return {
    address: wallet.address,
    pin,
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Derive the public-safe AgentIdentity from a full AgentKeypair.
 * Safe to share or transmit.
 */
export function toIdentity(keypair: AgentKeypair): AgentIdentity {
  return {
    address: keypair.address,
    pin: keypair.pin,
    publicKey: keypair.publicKey,
    createdAt: keypair.createdAt,
  };
}

/**
 * Restore a wallet instance from a stored private key.
 * Used internally for signing — never expose the returned wallet.
 */
export function walletFromPrivateKey(privateKey: string): Wallet {
  return new Wallet(privateKey);
}

/**
 * Validate that a string is a well-formed Ethereum-style 0x address.
 */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Validate a .mmcp PIN format: lowercase alphanumeric + dots, ends in .mmcp
 */
export function isValidPin(pin: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.mmcp$/.test(pin);
}
