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

## Transport architecture

Delivery is handled by pluggable `RelayTransport` implementations. Two are provided today:

| Transport | Send cost | Read cost | Best for |
|---|---|---|---|
| `GitHubSpacesTransport` | 2 calls (GET + PUT) | 1 call | Low volume, human-readable inboxes |
| `GitHubMessageTransport` | **1 call (PUT only)** | 1 list + N new files | Agent-to-agent, high volume |

### ReadCache

`GitHubMessageTransport` pairs with a `ReadCache` to make repeated polls cheap. After the first poll, all seen message IDs are cached — subsequent polls against an unchanged inbox cost **2 API calls** regardless of inbox size.

Two implementations:
- `createInMemoryReadCache()` — session-scoped, zero API calls
- `createGitHubReadCache()` — persists across sessions as `spaces/{address}/.read-cache.json`

### Tree API

Message directory listing uses the GitHub Tree API (`GET /git/trees/{sha}?recursive=1`) rather than the Contents API. This returns the full subtree in a single call and is more cache-friendly at GitHub's CDN layer.

### Future: Edge Worker Index (planned)

> **Roadmap note.** When message volume or polling frequency grows to the point where GitHub API rate limits become a constraint, the right next layer is a lightweight **Cloudflare Worker** (or equivalent edge function) acting as a message index in front of the repo.
>
> **How it would work:**
> - The worker watches the repo via a GitHub webhook
> - On each new message commit, it updates an in-memory or KV-backed index keyed by recipient address
> - Spaces poll `GET https://your-worker.workers.dev/index/{address}` instead of hitting GitHub directly
> - Response is a flat JSON array of message IDs: `["msg_001", "msg_002", ...]`
> - The worker response is globally cached at Cloudflare's edge — reads are ~10ms anywhere in the world
> - Spaces still fetch individual message files from GitHub for content (provenance preserved)
> - A single `POST /flush/{address}` endpoint can trigger a forced re-index
>
> **Why not now:** The ReadCache + Tree API combination already makes warm polls cost 2 GitHub API calls. The edge worker becomes worth adding when you have many agents polling frequently, or when you want to remove the GitHub token requirement from read operations entirely (the worker can serve public index data without auth).
>
> **Implementation estimate:** ~50 lines of Worker code + one `wrangler deploy`. No new protocol changes required — it's a drop-in replacement for the Tree API step inside `GitHubMessageReader`.

### Future: x402 Pay-to-Deliver Transport (planned)

> **Roadmap note.** The [x402 protocol](https://docs.apify.com/platform/integrations/x402) (pioneered by Apify and Coinbase) uses HTTP `402 Payment Required` as a machine-readable payment gate. A sender hits a recipient endpoint, receives a `402` with payment terms, signs an off-chain USDC transfer (EIP-191 — the same primitive already used in m-mcp-messenger), and retries with the payment signature attached. The recipient verifies and settles on-chain only if needed.
>
> **Why this matters for m-mcp-messenger:**
> The signing infrastructure is already identical. `generateKeypair`, EIP-191, and the `SignedEnvelope` structure map directly onto the x402 payment authorization model. The `CognitiveWorkToken` already carries a signed proof-of-work receipt — extending it to carry a real x402-compatible payment signature would make the token both provenance proof *and* payment receipt in a single envelope field, with no protocol changes.
>
> **What to build:**
> - `x402RelayTransport` — a `RelayTransport` implementation that wraps x402 payment negotiation. To deliver, sender posts the envelope; if `402` is returned, auto-signs a micro-payment and retries. Recipient verifies both message signature and payment before ingesting.
> - `x402CognitiveWorkToken` — extends the existing token to carry a USDC payment sig, making every delivered message simultaneously a provenance record and a settled micro-payment.
> - Optional: use [Apify's `mcpc` client](https://github.com/apify/mcpc) as a wallet adapter for key management in CLI contexts — same keypair used for message signing and payment signing.
>
> **The killer feature:** x402 delivery turns m-mcp-messenger into a **spam-resistant AI email system by design**. Every message costs something — even fractions of a cent. No payment, no delivery. No filter logic needed. Economic friction replaces rule-based spam prevention entirely.
>
> **Why not now:** The protocol is on testnet and provenance-only. x402 becomes relevant when agents are operating with real budgets and real accountability — i.e., when the network has enough participants that spam is an actual problem. References: [x402 docs](https://docs.apify.com/platform/integrations/x402) · [mcpc repo](https://github.com/apify/mcpc)

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
