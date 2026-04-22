# Payment Policy Design

This document describes the `PaymentPolicy` system — a per-address, declarative configuration that defines what token(s) a recipient will accept as payment for message delivery.

Payment policy is a planned extension of the [x402 Pay-to-Deliver Transport](./README.md#future-x402-pay-to-deliver-transport-planned) roadmap item. Read that section first for context on how x402 fits into the broader transport architecture.

---

## The Core Idea

Every `.mmcp` address optionally carries a `PaymentPolicy`. When a sender attempts delivery, they resolve the recipient's address, read the policy, sign a payment in an accepted token, and attach it to the envelope. If the sender cannot satisfy the policy — wrong token, wrong chain, insufficient amount — delivery is rejected before it is even attempted.

```
resolve recipient.mmcp
  → read PaymentPolicy
  → sender selects matching token
  → signs off-chain payment (EIP-191)
  → attaches to SignedEnvelope
  → recipient verifies token type + payment sig
  → ingests or rejects
```

No filter logic. No admin rules. No centralized spam list. **The payment policy IS the access control.**

---

## Schema

```typescript
interface PaymentPolicy {
  // One or more accepted token specifications.
  // Sender must satisfy at least one.
  accept: TokenSpec[];

  // Minimum payment amount per message (in the token's native decimals).
  // Optional — defaults to any non-zero amount.
  minAmount?: string;

  // Optional sender allowlist. If set, only these addresses can deliver
  // regardless of payment. Useful for org-internal accounts.
  allowedSenders?: string[]; // Ethereum addresses or .mmcp names

  // Optional org token gate. If set, sender must hold a non-zero
  // balance of this contract to even attempt delivery.
  requireOrgToken?: string; // ERC-20 contract address
}

interface TokenSpec {
  // Category of accepted token.
  type:
    | "stablecoin-usd"  // any USD-backed stablecoin (USDC, USDT, DAI, etc.)
    | "stablecoin-eur"  // any EUR-backed stablecoin
    | "btc"             // Bitcoin (native or wrapped)
    | "eth"             // Ether
    | "erc20"           // any specific ERC-20 (use contract field)
    | "org-token"       // company-issued internal token
    | "meme"            // meme coins (use contract or symbol field)
    | "cbdc"            // government-issued digital currency
    | "any";            // no restriction — any non-zero payment accepted

  // Specific ERC-20 contract address. Required for erc20, org-token, meme.
  contract?: string;

  // Chain the token lives on.
  chain?: "base" | "ethereum" | "solana" | "bitcoin" | "polygon" | string;

  // Human-readable label. Informational only — contract address is authoritative.
  symbol?: string;
}
```

---

## Example Policies

### Personal: USD stablecoins only

```json
{
  "accept": [
    { "type": "stablecoin-usd" }
  ]
}
```

Accepts USDC, USDT, DAI, or any recognized USD-backed stablecoin. No volatility. No meme coins.

---

### Personal: Bitcoin only

```json
{
  "accept": [
    { "type": "btc", "chain": "bitcoin" }
  ]
}
```

Bitcoin maximalist configuration. Nothing else accepted.

---

### Personal: Meme coin

```json
{
  "accept": [
    { "type": "meme", "symbol": "DOGE", "contract": "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", "chain": "base" }
  ]
}
```

Valid. Unusual. Their choice. The protocol does not have opinions about which tokens are "serious."

---

### Enterprise: Internal org token gate

```json
{
  "accept": [
    { "type": "org-token", "contract": "0xACME000000000000000000000000000000000001", "symbol": "ACME", "chain": "base" }
  ],
  "requireOrgToken": "0xACME000000000000000000000000000000000001",
  "minAmount": "1"
}
```

The company deploys an internal ERC-20 token (`ACME`). Every employee account is configured to accept only that token. Messages from outside the org — which hold no `ACME` — are rejected at the protocol level before delivery is attempted.

Access management becomes token management:
- **Onboard** a new employee → allocate `ACME` tokens
- **Offboard** an employee → revoke tokens
- **External vendor gets temporary access** → grant a time-locked token allocation

No IT ticket. No admin panel. No rule engine. The token IS the credential.

---

### Enterprise: Internal allowlist, no payment required

```json
{
  "accept": [{ "type": "any" }],
  "allowedSenders": [
    "alice.mmcp",
    "bob.mmcp",
    "0x1234567890abcdef1234567890abcdef12345678"
  ]
}
```

For internal systems where payment friction is undesirable but sender restriction is needed. Only allowlisted addresses can deliver. Useful for internal notification agents, CI bots, or executive inboxes.

---

### Regulatory: Compliant stablecoins, allowlisted senders

```json
{
  "accept": [
    { "type": "stablecoin-usd", "chain": "base" },
    { "type": "cbdc" }
  ],
  "allowedSenders": [
    "0xGovApproved1...",
    "0xGovApproved2..."
  ]
}
```

A government or regulated financial entity mandates that accounts only accept KYC'd stablecoins or CBDCs, and only from pre-approved sender addresses. The policy is stored with the address record — it is on-chain-readable, auditable, and enforced by the protocol, not by a compliance officer.

Regulators can mandate token type and sender origin without touching message content. The message layer remains private. The payment layer remains regulatable.

---

### Multi-token: Accept several options

```json
{
  "accept": [
    { "type": "stablecoin-usd" },
    { "type": "eth", "chain": "base" },
    { "type": "org-token", "contract": "0xACME...", "symbol": "ACME" }
  ],
  "minAmount": "0.001"
}
```

Recipient accepts USD stablecoins, ETH on Base, or internal ACME tokens. Sender picks whichever they hold. Common for accounts that bridge personal and enterprise contexts.

---

## How It Plugs Into the Stack

### Address Resolution

`PaymentPolicy` is stored alongside the public key in the address record — the same record resolved when looking up `alice.mmcp`. No new resolution step.

```typescript
interface AddressRecord {
  address: string;           // Ethereum-style address
  publicKey: string;         // For EIP-191 verification
  paymentPolicy?: PaymentPolicy; // Optional — if absent, no payment required
}
```

### x402 Negotiation Flow

The `x402RelayTransport` (see README roadmap) embeds the policy in the `402` response:

```
POST /deliver {envelope}
  ← 402 { paymentPolicy: {...}, paymentDue: "0.001 USDC" }

Sender evaluates policy:
  → has USDC? sign USDC payment, retry
  → has ACME? policy doesn't accept ACME → abort, report to sender agent
  → has nothing? abort

POST /deliver {envelope, X-PAYMENT: <sig>}
  ← 200 OK
```

### CognitiveWorkToken Extension

The existing `CognitiveWorkToken` carries proof-of-work. The x402 extension adds proof-of-payment:

```typescript
interface CognitiveWorkToken {
  // existing fields
  agentAddress: string;
  deviceId: string;
  timestamp: number;
  envelopeHash: string;
  signature: string;

  // x402 extension (optional)
  payment?: {
    tokenType: string;       // matches TokenSpec.type
    contract?: string;       // ERC-20 contract if applicable
    chain: string;
    amount: string;
    paymentSignature: string; // EIP-191 off-chain payment sig
    txHash?: string;          // on-chain settlement hash if settled
  };
}
```

When present, the token is simultaneously:
- Proof that a specific agent created the message
- Proof that a specific payment was made in an accepted token
- An on-chain-verifiable receipt if `txHash` is populated

---

## The Governance Model

This design separates three layers that existing systems collapse into one:

| Layer | Who controls it | How |
|---|---|---|
| **Message content** | Sender + recipient | End-to-end encrypted, private |
| **Delivery access** | Recipient | `PaymentPolicy` on their address record |
| **Token compliance** | Regulator / org | Mandate which `TokenSpec.type` is valid in a jurisdiction or org |

Regulators do not need to read messages to regulate access. They regulate the payment token type — a public, auditable parameter — and the message layer stays private. Enterprises do not need a centralized spam filter. They issue tokens, and the token IS the filter.

---

## Implementation Plan

### Phase 1 — Policy Schema (no payment yet)
- Add `PaymentPolicy` and `TokenSpec` types to the core protocol
- Add `paymentPolicy` field to `AddressRecord`
- Add policy serialization/deserialization
- Add policy validation (reject invalid token specs at write time)

### Phase 2 — x402 Transport Integration
- Implement `x402RelayTransport` (see README roadmap)
- Read policy during `402` negotiation
- Implement token type matching logic (sender selects from `accept[]`)
- Reject delivery if no matching token held

### Phase 3 — CognitiveWorkToken Extension
- Add optional `payment` field to `CognitiveWorkToken`
- Populate on successful x402 delivery
- On-chain settlement hook for `txHash`

### Phase 4 — Enterprise Features
- `requireOrgToken` balance check (read ERC-20 balance before delivery attempt)
- `allowedSenders` enforcement
- Admin tooling for org token issuance and revocation
- Audit log export (policy + token type + sender per delivered message)

---

## Open Questions

- **Token type registry** — who maintains the canonical list of what counts as a `stablecoin-usd`? Options: hardcoded list in the protocol, on-chain registry, or recipient-specified contract addresses only.
- **CBDC support** — CBDCs vary by jurisdiction and technical implementation. May need a `cbdc` sub-type with `jurisdiction` field.
- **Org token issuance** — should m-mcp-messenger provide tooling to deploy an internal ERC-20, or assume the org brings their own contract?
- **Policy versioning** — if a recipient changes their policy, in-flight messages signed against the old policy need a grace period or re-negotiation.
- **Fee routing** — does the payment go directly to the recipient, to a relay operator, or split? x402 supports fee splitting natively.

---

## References

- [x402 Protocol Docs](https://docs.apify.com/platform/integrations/x402) — Apify's implementation of HTTP 402 agentic payments
- [mcpc repo](https://github.com/apify/mcpc) — MCP client with x402 wallet support
- [EIP-191](https://eips.ethereum.org/EIPS/eip-191) — Signed data standard (already used in m-mcp-messenger)
- [README → x402 roadmap note](./README.md#future-x402-pay-to-deliver-transport-planned)
