# Tokenized Lead Gateway

A tokenized entry point for lead capture forms, sales funnels, and any human-initiated engagement that has real business value on the receiving end.

Built on the same `PaymentPolicy` and EIP-191 signing primitives as [m-mcp-messenger](./README.md). See [PAYMENT_POLICY.md](./PAYMENT_POLICY.md) for the foundational payment layer this doc extends.

---

## The Problem

### Signal Collapse in Lead Generation

For years, form-fill rate was a reliable proxy for lead intent. A visitor who filled out a contact form, requested a demo, or booked a call was expressing real interest. Businesses optimized around this signal because it meant something.

That signal is collapsing.

**The AI Brute Force Form Attack** is a new class of automated abuse where agents fill out lead forms at scale. It does not need to be sophisticated. It only needs to fill required fields with plausible data, pass basic bot detection, and submit at a rate that overwhelms the sales team's ability to qualify.

The result: a business that previously received 100 visitors/day with a 3-5% form fill rate now receives the same traffic but a 20-40% fill rate. Most of it is automated noise.

**The economics flip:**

| Metric | Before | After AI attack |
|---|---|---|
| Daily visitors | 100 | 100 |
| Form fill rate | 3-5% | 20-40% |
| Actual human leads | 3-5 | 3-5 (unchanged) |
| Noise submissions | ~0 | 15-35 |
| Sales time wasted | Minimal | Severe |
| Cost per real lead | Manageable | Multiplied |

The paid traffic cost is unchanged. The ad spend is unchanged. But the cost of processing, qualifying, and following up has multiplied while the actual pipeline has not.

### Why Existing Defenses Fail

- **CAPTCHA** — Solved by modern vision models trivially.
- **Honeypot fields** — Evaded by any agent that reads the DOM.
- **Rate limiting** — Distributed attacks from many IPs bypass this.
- **Lead scoring by device/location/estimated net worth** — Heuristics that can be spoofed and do not reflect actual intent.
- **Email verification** — Verifies an email exists, not that a human sent it.

All of these are filters applied *after* the form is submitted. They fight the symptom. None of them change the economics of the attack.

### The Right Defense: Change the Economics

The only defense that cannot be bypassed by a smarter bot is one that imposes a **real economic cost per submission**. Not a friction pattern. Not a puzzle. A deposit.

An AI agent filling 10,000 forms at a $2 deposit each costs $20,000. The attack becomes unprofitable. The signal is restored.

---

## The Solution: Tokenized Lead Gateway

A micro-deposit, held in escrow, attached to every form submission. Not a paywall. A skin-in-the-game filter.

```
visitor arrives at lead form
  -> gateway prompts: "A $2 deposit is required to submit."
  -> visitor connects wallet or uses embedded payment
  -> signs micro-deposit into escrow contract (EIP-191, off-chain)
  -> form submits with signed payment receipt attached
  -> business receives: form data + deposit receipt + wallet address
  -> escrow resolves:
      -> refunded if business does not contact within SLA window
      -> credited toward purchase if deal closes
      -> forfeited if lead no-shows scheduled call
```

### What Changes

- **AI bots cannot submit for free.** Economic cost per submission is real.
- **Low-intent humans self-select out.** Paying $2 to fill a form filters out casual clickers.
- **High-intent leads are verified by behavior.** Willingness to deposit signals genuine interest.
- **The wallet address IS the lead identity.** Pseudonymous, verifiable, unforgeable.
- **Businesses are accountable too.** If they do not follow up within the SLA, the deposit is returned. This is a two-sided commitment.

---

## Deposit Models

The business sets the policy. The visitor accepts or does not.

### Refundable Deposit (Default)

```json
{
  "model": "refundable",
  "amount": "2.00",
  "token": { "type": "stablecoin-usd" },
  "sla": {
    "contactWithin": "48h",
    "refundOnMiss": true
  }
}
```

Deposit is held in escrow. If the business does not contact the lead within 48 hours, the deposit is automatically returned. Creates accountability on both sides.

### Non-Refundable Entry Fee

```json
{
  "model": "fee",
  "amount": "5.00",
  "token": { "type": "stablecoin-usd" }
}
```

Flat fee to submit. No refund. Appropriate for high-value consultations or exclusive access forms where the business's time has a defined floor value.

### Credited Toward Purchase

```json
{
  "model": "credit",
  "amount": "10.00",
  "token": { "type": "stablecoin-usd" },
  "creditOnClose": true
}
```

Deposit is credited as a discount or account credit if the deal closes. Reframes the deposit as a down payment. Psychologically appealing to high-intent buyers while still filtering bots.

### Internal Token (Enterprise)

```json
{
  "model": "refundable",
  "amount": "100",
  "token": {
    "type": "org-token",
    "contract": "0xACME...",
    "symbol": "ACME"
  }
}
```

For enterprise internal forms: project intake, IT requests, executive briefing requests. Employees have a token budget; frivolous requests consume it. No token, no submission. Aligns internal demand with real priority.

---

## The Lead Record

Every submission produces a `TokenizedLead` — a structured record combining form data with a cryptographically verifiable deposit receipt.

```typescript
interface TokenizedLead {
  // Standard form data (business-defined)
  formData: Record<string, string>;

  // Wallet-based identity — pseudonymous but verifiable
  walletAddress: string;

  // Deposit receipt
  deposit: {
    model: "refundable" | "fee" | "credit";
    amount: string;
    token: TokenSpec;             // from PAYMENT_POLICY.md
    escrowContract: string;
    paymentSignature: string;     // EIP-191 off-chain sig
    txHash?: string;              // on-chain if settled
    depositedAt: number;          // unix timestamp
  };

  // SLA tracking
  sla?: {
    contactDeadline: number;
    contactedAt?: number;
    refundedAt?: number;
    closedAt?: number;
  };

  submittedAt: number;
  formId: string;
  gatewayVersion: string;
}
```

The `walletAddress` is the lead's permanent identity across submissions. A lead who submits twice is the same wallet. A lead who converts is the same wallet as the customer. No CRM deduplication heuristics needed — the wallet IS the identity.

---

## Lead Quality Signal

The deposit amount and model create a natural lead scoring tier with no ML, behavioral tracking, or demographic inference:

| Deposit | Signal |
|---|---|
| $0 (no gateway) | Unknown intent. Volume metric only. |
| $1-2 refundable | Basic human filter. Bot economics broken. |
| $5 non-refundable | Meaningful intent. Casual clickers opt out. |
| $10+ credited toward purchase | High intent. Effectively a down payment. |
| Internal org token | Verified employee or org member. |

Businesses can tier their funnel: free content -> $1 gated webinar -> $5 demo request -> $25 strategy call. Each tier self-selects for higher intent. No scoring algorithm. The deposit IS the score.

---

## Escrow Contract

A simple smart contract. No governance. No upgradeable proxy. No admin key. The contract is a neutral third party that enforces the SLA mechanically. Both sides verify the rules before submitting. Neither can unilaterally change them.

```
deposit(leadId, amount, token, slaDeadline)
  -> holds funds
  -> emits DepositReceived(leadId, walletAddress, amount)

release(leadId)
  -> called by business after contact
  -> transfers to business
  -> emits Released(leadId)

refund(leadId)
  -> callable by lead after slaDeadline if not released
  -> or triggered automatically via keeper
  -> returns funds to wallet
  -> emits Refunded(leadId)

credit(leadId, invoiceId)
  -> called at deal close
  -> applies deposit as credit against invoice
  -> emits Credited(leadId, invoiceId)
```

---

## Integration

### Drop-in Script Tag

For any existing HTML form:

```html
<script src="https://cdn.mmcp.io/lead-gateway.js"></script>
<form data-mmcp-gateway data-policy-id="your-policy-id">
  <input name="name" />
  <input name="email" />
  <input name="message" />
  <button type="submit">Request Demo</button>
</form>
```

The script intercepts the submit event, shows the deposit prompt, handles wallet connection or embedded payment, attaches the receipt to the form payload, and submits. No backend changes required for basic integration.

### SDK (Node / TypeScript)

```typescript
import { LeadGateway } from '@m-mcp/lead-gateway';

const gateway = new LeadGateway({
  policyId: 'your-policy-id',
  escrowContract: '0xESCROW...',
  sla: { contactWithin: '48h', refundOnMiss: true },
});

// Verify an inbound lead deposit before processing
const lead = await gateway.verify(inboundPayload);
if (lead.deposit.verified) {
  await crm.createContact(lead);
  await gateway.startSLAClock(lead.formId);
}

// Mark as contacted (stops SLA clock, holds deposit)
await gateway.markContacted(lead.formId);

// Release deposit to business on close
await gateway.release(lead.formId);

// Refund if SLA missed
await gateway.refund(lead.formId);
```

### Webhook Events

```
leadGateway.deposit.received    -> new TokenizedLead created
leadGateway.sla.warning         -> SLA deadline approaching
leadGateway.sla.missed          -> auto-refund triggered
leadGateway.deposit.released    -> business received funds
leadGateway.deposit.refunded    -> lead received refund
leadGateway.deposit.credited    -> applied to closed deal
```

---

## Relationship to m-mcp-messenger

The Tokenized Lead Gateway is a surface-level product built on the same primitives as m-mcp-messenger:

| Primitive | m-mcp-messenger use | Lead Gateway use |
|---|---|---|
| EIP-191 signing | Message envelope signature | Deposit authorization signature |
| `PaymentPolicy` | Recipient message gate | Form submission gate |
| `CognitiveWorkToken` | Message delivery proof | Lead submission proof |
| Wallet address | Agent identity | Lead identity |
| Escrow | Planned for x402 | Deposit escrow per lead |

The same wallet that sends a signed message to `sales@company.mmcp` can submit a tokenized lead form on the company's website. The lead record and the message thread share a wallet identity — the CRM contact and the m-mcp inbox contact are provably the same entity.

This creates a unified identity layer across web form submissions, direct agent-to-agent messages, sales pipeline records, and on-chain payment history.

---

## Product Surfaces

### `m-mcp-lead` (Standalone SDK)
Drop-in JavaScript library for any website. Configure policy, add script tag, done. No backend required for basic use.

### Enterprise Lead Gateway
Full-featured deployment with:
- Custom escrow contract per org
- Internal org token support
- CRM webhook integration (Salesforce, HubSpot, Pipedrive)
- SLA dashboard showing which leads are approaching refund deadline
- Lead quality analytics: deposit amount vs. close rate correlation
- Multi-form policy management

### Personal Gateway
For individual consultants, freelancers, and creators:
- Set your own rate for discovery calls
- Refundable deposit means serious inquiries only
- Calendar integration: deposit triggers booking, refund if you do not confirm
- Works with any existing contact form or booking tool

---

## Open Questions

- **Wallet UX for non-crypto users** — On-ramp options for leads who have never used crypto: embedded wallet (Privy, Dynamic), credit card to stablecoin bridge, or custodial option where the gateway holds a fiat-backed balance on behalf of the user.
- **Minimum viable deposit** — The floor that breaks bot economics without filtering real humans varies by industry and deal size. Suggested ranges: high-ticket B2B $10-50, SMB services $2-5, consumer $0.50-1.
- **Regulatory considerations** — Holding customer deposits in escrow may trigger money transmission regulations in some jurisdictions. Smart contract escrow may be treated differently than custodial escrow. Needs legal review per deployment region.
- **Refund automation** — Who triggers the refund if the business misses the SLA? Options: lead calls `refund()` manually, a keeper bot monitors deadlines, or the escrow contract uses a time-lock. Keeper bot is simplest UX.
- **Fraud by businesses** — A bad-faith business could take deposits and never contact leads. The SLA and auto-refund mechanism addresses this mechanically, but on-chain release rate as a public reputation signal would help surface trustworthy vs. predatory deployments.
- **Ad platform conversion tracking** — Google Ads and Meta Ads track conversions by form fill. A gated form changes the conversion event. Guidance needed on updating conversion tracking to use deposit receipt as the conversion signal instead of raw form submit.

---

## References

- [PAYMENT_POLICY.md](./PAYMENT_POLICY.md) — Payment policy schema and token types
- [README -> x402 roadmap note](./README.md#future-x402-pay-to-deliver-transport-planned) — x402 transport context
- [EIP-191](https://eips.ethereum.org/EIPS/eip-191) — Signed data standard used throughout m-mcp
- [x402 Protocol Docs](https://docs.apify.com/platform/integrations/x402) — HTTP 402 agentic payment standard
- [mcpc repo](https://github.com/apify/mcpc) — MCP client with x402 wallet support
