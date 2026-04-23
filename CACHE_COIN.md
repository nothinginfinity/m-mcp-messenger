# Cache-Coin

A site-scoped, ephemeral, earned token that lets anyone access a gated experience without a crypto wallet, a purchase, or an account.

Cache-Coin is a mint mechanism layered on top of the [Tokenized Lead Gateway](./TOKENIZED_LEAD_GATEWAY.md) and [Payment Policy](./PAYMENT_POLICY.md) infrastructure. It solves the wallet UX problem for non-crypto users by replacing "pay with money" with "pay with value you already hold or can produce."

---

## The Name

**Cache** is intentional and carries two meanings simultaneously:

- **Cache as stored value** — the data, conversation, or work that mints a Cache-Coin already cost something to produce. API tokens were spent. Time was invested. Photos were taken. The coin unlocks that pre-existing stored value.
- **Cache as reserve** — a cache of resources built up through real activity. You earn by doing real things. You spend on real access.

Cache-Coin is explicitly **not money**. It is a redeemable proof that something real was contributed. It has no monetary value, cannot be transferred between sites, and evaporates when the session ends (in the ephemeral model). This distinction matters legally, conceptually, and for user trust.

---

## The Core Idea

Every website that deploys Cache-Coin defines:

1. **What earns coins** — the mint mechanisms (tasks, conversations, data contributions)
2. **What coins buy** — form submission, gated content, account creation, premium access
3. **How long coins last** — session-scoped (ephemeral) or account-bound (persistent)
4. **The exchange rate** — how much of what action = how many coins = what access

The user never sees a blockchain. Never installs a wallet. Never buys anything. They do something the site values, the site mints them coins, they spend the coins on access. The entire economy is contained within the site.

```
user arrives at gated experience
  -> no wallet, no account required
  -> site presents mint options: "Earn access by..."
  -> user completes a mint action
  -> server validates completion authenticity
  -> Cache-Coins minted into ephemeral wallet
  -> user spends coins on access
  -> coins consumed, access granted
  -> session ends -> wallet evaporates
```

---

## The Ephemeral Wallet

No blockchain. No private key. No seed phrase. No account creation.

```typescript
interface CacheCoinWallet {
  // Session identity — browser-scoped, not user-scoped
  sessionId: string;
  siteId: string;               // wallet is site-scoped, non-transferable

  // Balance
  coins: number;
  lifetimeEarned: number;       // total minted this session
  lifetimeSpent: number;        // total spent this session

  // Audit trail
  mintHistory: MintRecord[];
  spendHistory: SpendRecord[];

  // Expiry
  createdAt: number;            // unix timestamp
  expiresAt: number;            // session-bound by default
  persistent: boolean;          // true if account-bound (opt-in)
}

interface MintRecord {
  mechanism: MintMechanism;     // how it was earned
  coinsEarned: number;
  mintedAt: number;
  verificationHash: string;     // server-signed proof of authentic completion
  dataContributionId?: string;  // if data was contributed, a reference to the receipt
}

interface SpendRecord {
  accessType: string;           // what was purchased
  coinsSpent: number;
  spentAt: number;
  accessGranted: boolean;
}
```

The `verificationHash` on every `MintRecord` is signed server-side on verified completion — not on submission. A bot cannot mint coins by faking a task completion because the server signs the coin only after validating the output is genuine.

---

## Mint Mechanisms

The site operator defines which mechanisms are active. Multiple can be offered simultaneously so the user chooses how they want to earn.

### 1. Micro-Task

The entry-level mechanism. Simple, fast, discrete.

```typescript
{
  type: "micro-task",
  task: "label-image" | "verify-fact" | "rate-content" | "transcribe-audio" | "tag-product",
  estimatedMinutes: 2,
  coinsPerCompletion: 1,
  validationMethod: "server-side" | "consensus"
}
```

Not fire hydrant CAPTCHA. Tasks with genuine output value:
- Label images for a training dataset the site actually uses
- Verify facts in a knowledge base
- Rate content quality for a recommendation model
- Transcribe a short audio clip
- Tag products with attributes

The task output goes somewhere useful. The coin is the receipt of that utility being produced.

**Bot resistance:** Faking useful task output requires LLM inference cost per submission. Not impossible, but no longer free.

---

### 2. Survey

The site needs information. The user provides it. Coins are the exchange.

```typescript
{
  type: "survey",
  questions: SurveyQuestion[],
  estimatedMinutes: 5,
  coinsPerCompletion: 3,
  minimumResponseQuality: "basic" | "detailed" | "scored",
  validationMethod: "completeness" | "coherence-check" | "ai-scored"
}
```

The validation method matters. A bot can fill out a survey with plausible text. An AI-scored survey checks for coherence, specificity, and genuine engagement with the questions. The scoring threshold is set by the operator.

The survey data is market research the business actually needs. The Cache-Coin is the compensation. No intermediary. No panel company taking 80% of the value.

---

### 3. Live Conversation (High Value)

The user has a real-time conversation with the site's AI agent. The conversation is valuable as training data, as intent signal, and as a genuine service interaction.

```typescript
{
  type: "conversation",
  agent: "site-ai",
  minimumDuration: 600,         // 10 minutes in seconds
  minimumTurns: 8,              // minimum back-and-forth exchanges
  coinsPerConversation: 10,
  conversationGoal: string,     // e.g. "help user find the right product"
  dataRetention: DataRetentionPolicy
}
```

The agent is not a gatekeeper. It is doing real work:
- Understanding what the user actually needs
- Answering questions about the site, product, or service
- Routing to relevant pages or resources
- Qualifying the lead through natural conversation

The conversation IS the top-of-funnel sales process. The Cache-Coin is minted at the end as proof the interaction happened authentically. The site receives:
- A qualified lead with a conversation transcript
- Training data for improving the agent
- Intent signal: what does this type of visitor actually want?

At 1,000 visitors/day, this is 1,000 unique training conversations per day — each one paid for by the API tokens already spent on the interaction itself.

**Bot resistance:** Synthetic conversations are detectable. An agent trained on real visitor conversations learns to recognize hollow, scripted, or AI-generated responses. The minimum turn count and coherence validation raise the cost of faking significantly.

---

### 4. Data Contribution (Highest Value)

The user contributes data they already own. The data already cost something to produce — API tokens, time, creative effort. Cache-Coin unlocks that pre-paid value.

```typescript
{
  type: "data-contribution",
  dataTypes: DataContributionType[],
  coinsPerUnit: Record<DataContributionType, number>,
  consentRequired: true,        // always true, non-negotiable
  retentionPolicy: DataRetentionPolicy,
  receiptIssued: true           // always true — user gets a signed contribution record
}

type DataContributionType =
  | "chat-history"              // exported conversations from Perplexity, ChatGPT, Claude, etc.
  | "original-photos"           // user-taken images (not scraped, not stock)
  | "documents"                 // personal notes, writing, creative work
  | "voice-recordings"          // audio in user's own voice
  | "domain-expertise"          // structured Q&A in a field the user knows
  | "feedback-annotations"      // corrections and improvements to existing model outputs
```

**Why this data is uniquely valuable:**

- **Chat histories** — real human reasoning patterns. How this person thinks, asks questions, refines ideas. Not synthetic. Each conversation cost real API tokens to generate.
- **Original photos** — unique visual data not available anywhere else. Cannot be scraped. Not in any existing dataset.
- **Documents and writing** — authentic human voice, style, domain knowledge. High signal for fine-tuning.
- **Voice recordings** — accent, intonation, cadence. Valuable for speech models.
- **Domain expertise Q&A** — a nurse answering medical questions, a lawyer explaining concepts, an engineer troubleshooting. Irreplaceable for domain-specific model improvement.

The user is not sharing browsing history. They are sharing **intellectual and creative output that they intentionally produced** and choosing to contribute a subset of it in exchange for access.

---

## Authenticity: The Core Problem

Every mint mechanism must solve the same problem: **how do you know the contribution is real?**

Synthetic data — AI-generated conversations, stock photos, fabricated surveys — is worse than no data. It poisons the training set. The authenticity problem is not optional to solve.

### Authenticity Signals by Mechanism

| Mechanism | Authenticity signal | Fake cost |
|---|---|---|
| Micro-task | Output quality scoring | Low — easy to fake basic tasks |
| Survey | Coherence + specificity scoring | Medium — requires LLM per submission |
| Live conversation | Real-time agent evaluation, turn count, coherence | High — sustained LLM inference |
| Chat history | Metadata consistency, API token cost evidence, style analysis | Very high — must fabricate an entire history |
| Original photos | EXIF data, reverse image search, perceptual uniqueness hash | Very high — must generate novel unique images |
| Documents | Style consistency, domain coherence, originality scoring | High — detectable via similarity search |

### The Verification Stack

```typescript
interface AuthenticityVerification {
  // Did the submission come from a real interaction?
  interactionProof: {
    sessionDuration: number;
    inputTimings: number[];     // keystroke/interaction timing patterns
    deviceFingerprint: string;  // non-PII device signal
  };

  // Is the content genuinely human-produced?
  contentProof: {
    originalityScore: number;   // 0-1, similarity to known synthetic outputs
    coherenceScore: number;     // 0-1, internal logical consistency
    specificityScore: number;   // 0-1, contains genuine specific detail vs. generic text
    domainScore?: number;       // 0-1, for domain expertise contributions
  };

  // Server-side signature on verified completion
  verificationHash: string;     // HMAC of (sessionId + mechanism + scores + timestamp)
  verifiedAt: number;
  passed: boolean;
}
```

The `verificationHash` is issued only when `passed: true`. No hash, no mint. The user cannot self-issue coins.

---

## Data Ownership Model

Cache-Coin data contributions must be built on explicit, legible consent. Not buried ToS. Not implied opt-in. A clear exchange the user understands and agrees to before contributing.

### The Four Rights

**1. Transparency — know what you're contributing**

Before any data contribution, the site presents:
- Exactly what data will be collected
- How it will be used (training, analysis, personalization)
- Who will have access
- How long it will be retained

No dark patterns. No pre-checked boxes.

**2. Receipt — proof of contribution**

Every data contribution issues a signed `ContributionReceipt`:

```typescript
interface ContributionReceipt {
  contributionId: string;       // unique ID
  siteId: string;
  dataType: DataContributionType;
  contributedAt: number;
  dataHash: string;             // hash of the contributed data, not the data itself
  coinsIssued: number;
  retentionPolicy: DataRetentionPolicy;
  signature: string;            // site-signed EIP-191, same pattern as m-mcp-messenger
}
```

The user keeps this receipt. It proves what they gave, when, and to whom. If the site claims they never contributed, the receipt proves otherwise.

**3. Deletion — right to remove**

The `contributionId` is the deletion key. The user presents their receipt and requests deletion. The site must:
- Remove the raw contributed data from storage
- Flag the contribution in any derived datasets for exclusion on next training run
- Issue a `DeletionConfirmation` signed with the same pattern

Perfect deletion from trained model weights is not possible (same limitation as GDPR's right to be forgotten in ML contexts), but raw data deletion is.

**4. Royalty (optional, future) — share in the value created**

If the site's model improves measurably from a contribution cohort, a micro-royalty distribution back to contributors is possible. The `ContributionReceipt` is the claim token. This is a future feature — it requires on-chain settlement and a revenue attribution model — but the receipt infrastructure supports it from day one.

### Data Retention Policy

```typescript
interface DataRetentionPolicy {
  rawDataRetentionDays: number; // how long raw contribution is stored
  derivedUse: "training" | "analysis" | "personalization" | "all";
  thirdPartySharing: false;     // Cache-Coin data is never sold or shared
  deletionMethod: "immediate" | "next-cycle";  // when deletion request is processed
}
```

`thirdPartySharing` is always `false`. Cache-Coin data contributions are between the user and the site. The model trained on them belongs to the site. The data itself is not a product to be resold.

---

## The Compounding Value Loop

This is the mechanism that makes Cache-Coin more than a spam filter:

```
Day 1: 1,000 visitors -> 1,000 conversations -> site AI learns visitor intent patterns
Day 7: site AI asks better questions -> conversations are higher quality -> better training signal
Day 30: site AI understands this audience deeply -> conversion rate improves -> better leads
Day 90: proprietary dataset of 90,000 real visitor conversations -> moat vs. generic AI tools
```

Every Cache-Coin minted is also an investment in the site's model. The spam filter and the model trainer are the same system. The cost of running the system (API tokens for conversations, compute for validation) is offset by the value of the data produced.

A site using a generic LLM for its chatbot is renting intelligence. A site running Cache-Coin conversations is building proprietary intelligence, conversation by conversation, visitor by visitor.

---

## Access Tiers

Cache-Coin works alongside crypto payment and org token access. Together they form a complete access economy with no gaps:

| User type | Access path | Mechanism |
|---|---|---|
| Crypto-native | Pay with stablecoin, BTC, ETH | x402 + PaymentPolicy |
| Anyone with time | Earn Cache-Coins via task/survey | Cache-Coin mint |
| Anyone with data | Contribute owned data for Cache-Coins | Cache-Coin data contribution |
| High-intent visitor | Have a real conversation | Cache-Coin conversation mint |
| Enterprise employee | Org token balance check | PaymentPolicy org-token |
| Bad-faith bot | No path | All mechanisms have economic/authenticity cost |

No user who is genuinely human and genuinely interested is locked out. No bot gets in for free.

---

## Integration

### Drop-in Script Tag

```html
<script src="https://cdn.mmcp.io/cache-coin.js"></script>
<div data-cache-coin-gate
     data-cost="3"
     data-mechanisms="conversation,survey,task"
     data-policy-id="your-policy-id">
  <!-- gated content or form goes here -->
</div>
```

The script wraps the gated element. When a user without sufficient coins tries to access it, the mint interface appears. They choose a mechanism, complete it, coins are minted, access is granted, the element is revealed.

### SDK (Node / TypeScript)

```typescript
import { CacheCoin } from '@m-mcp/cache-coin';

const cc = new CacheCoin({
  siteId: 'your-site-id',
  mechanisms: ['conversation', 'survey', 'task'],
  dataRetention: {
    rawDataRetentionDays: 90,
    derivedUse: 'training',
    thirdPartySharing: false,
    deletionMethod: 'immediate',
  },
});

// Verify a Cache-Coin spend attempt
const result = await cc.verifySpend({
  sessionId,
  coinsRequired: 3,
  accessType: 'form-submission',
});

if (result.granted) {
  // process the form
}

// Issue coins after verified mint action
const mintResult = await cc.mint({
  sessionId,
  mechanism: 'conversation',
  verificationData: conversationTranscript,
});

console.log(mintResult.coinsIssued); // e.g. 10
console.log(mintResult.verificationHash); // server-signed proof
```

---

## Relationship to the Broader Stack

| Component | Role |
|---|---|
| `PaymentPolicy` | Defines what a recipient/site accepts as payment |
| `TokenizedLeadGateway` | Applies payment policy to form submission and lead capture |
| **Cache-Coin** | Provides the non-crypto mint path: earn coins by contributing real value |
| `CognitiveWorkToken` | Proof-of-work receipt used in m-mcp-messenger; `ContributionReceipt` follows the same pattern |
| `x402RelayTransport` | Crypto payment path for crypto-native users |

Cache-Coin is the **human on-ramp** to a system that also supports crypto payments and org token gates. It ensures that economic access control does not become a class barrier — anyone willing to contribute something real can participate.

---

## Open Questions

- **Conversation data portability** — should a user be able to export their `ContributionReceipt` records as a portable credential proving they are a real, contributing human across sites? This is a natural extension toward a decentralized reputation layer.
- **Cross-site Cache-Coin** — today coins are site-scoped and non-transferable. Could a network of sites agree on a shared Cache-Coin standard where coins earned on one site are spendable on another? This requires a shared validation layer and opens questions about sybil resistance.
- **Royalty distribution infrastructure** — the `ContributionReceipt` supports future royalties but the settlement layer does not exist yet. Likely requires an on-chain registry of receipts and a periodic distribution contract.
- **Synthetic data detection arms race** — as detection improves, synthetic submission attempts will evolve. The authenticity stack needs to be updatable without breaking existing mint records.
- **Minimum viable conversation length** — 10 minutes is a suggested default. The right threshold varies by access value. A $0 piece of content needs 30 seconds. A strategy call booking might need 15 minutes. Should be operator-configurable with platform-suggested minimums.
- **Data regulation by jurisdiction** — contributed chat histories and voice recordings may be subject to GDPR, CCPA, PIPEDA, or other data protection frameworks depending on where the user is located. The consent and deletion infrastructure is designed with this in mind, but jurisdiction-specific compliance guidance is needed.

---

## References

- [TOKENIZED_LEAD_GATEWAY.md](./TOKENIZED_LEAD_GATEWAY.md) — the gateway this mint mechanism integrates with
- [PAYMENT_POLICY.md](./PAYMENT_POLICY.md) — payment policy schema and token types
- [README -> x402 roadmap note](./README.md#future-x402-pay-to-deliver-transport-planned) — crypto payment path context
- [EIP-191](https://eips.ethereum.org/EIPS/eip-191) — signed data standard used for contribution receipts
