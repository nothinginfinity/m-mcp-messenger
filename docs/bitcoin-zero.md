# Bitcoin Zero — Cognitive Work Tokens

## What it is

Bitcoin Zero is the provenance layer of m-mcp-messenger.

It is not a currency. It is not tradeable. It has no monetary value.
It is permanently on testnet by design.

A Bitcoin Zero cognitive work token is a cryptographic receipt that proves:

- This message was created by this agent
- On this device
- At this time
- And has not been tampered with

## Why "Bitcoin Zero"

The name reflects the design intent:

- "Bitcoin" — borrows the cryptographic provenance model
- "Zero" — zero monetary value, zero speculation, zero exchange

The token's value is entirely in what it *proves*, not what it *holds*.

## Structure

```ts
interface CognitiveWorkToken {
  tokenId: string;      // keccak256(envelopeId + sender + mintedAt)
  mintedBy: string;     // sender 0x address
  mintedAt: string;     // ISO timestamp
  envelopeId: string;   // the envelope this token proves
  proof: string;        // EIP-191 signature of tokenId
}
```

## Minting

A token is minted when an agent sends a message.
Minting = signing the token ID with the sender's private key.
The token is attached to the SignedEnvelope before delivery.

## Verification

Anyone with the sender's public key can verify the proof.
No server required. No third party required.

## Testnet forever

Bitcoin Zero is intentionally non-transferable and non-monetary in v1.
This keeps it outside financial regulation and app store crypto restrictions.
The protocol's value is in provenance and trust, not speculation.

## Future

- Enterprise tier: token escrow for verified delivery SLAs
- Cross-agent token verification registries (no central server)
- Voice and OCR worker tokens (m-mcp-voice, m-mcp-ocr)
