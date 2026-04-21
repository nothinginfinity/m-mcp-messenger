# Architecture

## Overview

m-mcp-messenger is a store-and-forward, async, signed message system.
It is built on the [m-mcp protocol](https://github.com/nothinginfinity/m-mcp) as a dependency.

## Layer map

```
Identity layer
  └ Keypair generation (on-device)
  └ .mmcp PIN resolution (local registry)

Envelope layer
  └ SignedEnvelope creation
  └ EIP-191 signing
  └ Verification (no server)

Token layer
  └ CognitiveWorkToken minting
  └ Provenance proof
  └ Attach to envelope

Store layer
  └ Local inbox / outbox
  └ Message status tracking
  └ Host app plugs in persistent storage

Delivery layer (planned)
  └ Local delivery (same device)
  └ Optional remote relay (policy-gated)
  └ m-mcp orchestrator integration
```

## Design invariants

- Private keys never leave the device
- Every message is signed by the sender
- Every token is verifiable without a server
- Remote relay is always opt-in
- Local-first: if delivery can happen on-device, it does

## Dependency on m-mcp

This repo depends on `m-mcp` for:
- ContextEnvelope base types
- Execution policy primitives
- Orchestrator (for capability execution on received messages)

It does not copy m-mcp code. It installs it as a package.

## Sibling repos

- [m-mcp](https://github.com/nothinginfinity/m-mcp) — core protocol runtime
- m-mcp-voice — voice → transcription → summary worker (coming soon)
