# Changelog

## v0.1.0 — 2026-04-21

### Initial scaffold

- Core type definitions: AgentKeypair, AgentIdentity, SignedEnvelope, CognitiveWorkToken, MessageStore
- Identity layer: on-device keypair generation, .mmcp PIN resolution
- Envelope layer: EIP-191 signed envelope creation and verification
- Token layer: Bitcoin Zero cognitive work token minting
- Store layer: in-memory inbox/outbox implementation
- Full test suite: identity, envelope, token, store
- Docs: address spec, Bitcoin Zero concept, architecture

### Coming next

- Delivery layer: local and relay delivery
- m-mcp orchestrator integration
- Host app integration guides (InfinityPaste, Studio-OS-Chat)
- m-mcp-voice: voice recorder → transcription → summary worker
