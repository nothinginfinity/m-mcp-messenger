import { describe, it, expect } from 'vitest';
import {
  generateKeypair,
  toIdentity,
  isValidAddress,
  isValidPin,
  walletFromPrivateKey,
} from '../src/identity/index.js';
import {
  createLocalResolver,
  registerPin,
} from '../src/identity/resolver.js';

describe('generateKeypair', () => {
  it('generates a valid Ethereum-style address', () => {
    const kp = generateKeypair();
    expect(isValidAddress(kp.address)).toBe(true);
  });

  it('stores a PIN when provided', () => {
    const kp = generateKeypair('alice.mmcp');
    expect(kp.pin).toBe('alice.mmcp');
  });

  it('generates unique keypairs each call', () => {
    const a = generateKeypair();
    const b = generateKeypair();
    expect(a.address).not.toBe(b.address);
    expect(a.privateKey).not.toBe(b.privateKey);
  });

  it('restores wallet from private key', () => {
    const kp = generateKeypair();
    const wallet = walletFromPrivateKey(kp.privateKey);
    expect(wallet.address.toLowerCase()).toBe(kp.address.toLowerCase());
  });
});

describe('toIdentity', () => {
  it('omits private key from identity', () => {
    const kp = generateKeypair('bob.mmcp');
    const identity = toIdentity(kp);
    expect((identity as any).privateKey).toBeUndefined();
    expect(identity.address).toBe(kp.address);
    expect(identity.pin).toBe('bob.mmcp');
  });
});

describe('isValidPin', () => {
  it('accepts valid .mmcp pins', () => {
    expect(isValidPin('alice.mmcp')).toBe(true);
    expect(isValidPin('agent-01.mmcp')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidPin('alice')).toBe(false);
    expect(isValidPin('alice.eth')).toBe(false);
    expect(isValidPin('.mmcp')).toBe(false);
    expect(isValidPin('ALICE.mmcp')).toBe(false);
  });
});

describe('createLocalResolver', () => {
  it('resolves a registered PIN to address', async () => {
    const kp = generateKeypair('carol.mmcp');
    const registry = new Map<string, string>();
    registerPin(registry, 'carol.mmcp', kp.address);
    const resolve = createLocalResolver(registry);
    const resolved = await resolve('carol.mmcp');
    expect(resolved).toBe(kp.address);
  });

  it('passes through a valid 0x address unchanged', async () => {
    const kp = generateKeypair();
    const registry = new Map<string, string>();
    const resolve = createLocalResolver(registry);
    const resolved = await resolve(kp.address);
    expect(resolved).toBe(kp.address);
  });

  it('returns null for unknown PIN', async () => {
    const registry = new Map<string, string>();
    const resolve = createLocalResolver(registry);
    const resolved = await resolve('unknown.mmcp');
    expect(resolved).toBeNull();
  });
});
