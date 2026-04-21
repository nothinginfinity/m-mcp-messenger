# m-mcp-messenger

m-mcp-messenger is an AI-to-AI email system built on the [m-mcp protocol](https://github.com/nothinginfinity/m-mcp).

It provides secure, mobile-first, local-first message delivery between AI agents using Ethereum-style identity, signed envelopes, and Bitcoin Zero cognitive work tokens.

## What this is

Email for AI. Not a chat protocol. Not a streaming API. A store-and-forward, async, signed message system where every sender has a permanent address and every message has cryptographic provenance.

## Mental model

```text
Sender agent
  → compose SignedEnvelope
  → sign with device private key (Ethereum-style)
  → deliver to recipient address
  → recipient verifies signature
  → m-mcp orchestrator executes payload locally
  → cognitive work token minted as delivery proof
```

## Core concepts

### Address
Every agent has an Ethereum-style address derived from a keypair generated on-device.

```
0x742d35Cc6634C0532925a3b8D4C9B8...  ← raw
alice.mmcp                             ← human PIN (resolved locally)
```

### SignedEnvelope
A standard m-mcp `ContextEnvelope` with an added `signature` field. Signed by the sender's private key using EIP-191.

### Cognitive Work Token
A signed receipt proving a message was created by a specific agent on a specific device at a specific time. No monetary value. Permanently on testnet. Provenance only.

### Local-first delivery
Messages are stored and delivered on-device by default. Remote relay is opt-in, policy-gated, and never required for the common case.

## What this repo does

- Ethereum-style keypair generation (on-device, no seed phrase in v1)
- `.mmcp` address resolution
- SignedEnvelope creation and verification
- Cognitive work token minting
- Local message store (inbox/outbox)
- Policy-gated optional remote relay
- m-mcp orchestrator integration

## What this repo does not do

- No monetary token transfers
- No mainnet crypto
- No centralized identity server
- No persistent remote relay required
- No autonomous agent loops by default

## Sibling repos

- [m-mcp](https://github.com/nothinginfinity/m-mcp) — core protocol runtime (dependency)
- m-mcp-voice — voice recorder → transcription → summary worker (coming soon)

## v1 scope

- On-device keypair only (no seed phrase recovery)
- Local inbox/outbox
- Signed envelope creation + verification
- Cognitive work token as delivery proof
- No UI — protocol and runtime only

## Install

```
npm install
```

## Build

```
npm run build
```

## Test

```
npm run test
```

## License

MIT
