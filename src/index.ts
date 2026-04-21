/**
 * m-mcp-messenger
 * AI-to-AI email system built on the m-mcp protocol.
 *
 * Exports:
 * - types: all protocol types
 * - identity: keypair generation, PIN resolution
 * - envelope: signed envelope creation and verification
 * - token: cognitive work token minting
 * - store: local message store
 * - delivery: local delivery + policy-gated remote relay
 * - reader: inbox polling and envelope ingestion
 */

export * from './types/index.js';
export * from './identity/index.js';
export * from './envelope/index.js';
export * from './token/index.js';
export * from './store/index.js';
export * from './delivery/index.js';
export * from './delivery/transports/index.js';
export * from './reader/index.js';
