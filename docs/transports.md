# Transports

Two `RelayTransport` implementations are provided. Both use GitHub as relay.
Choose based on your throughput and latency requirements.

## Transport Comparison

| | GitHubSpacesTransport | GitHubMessageTransport |
|---|---|---|
| **Send cost** | 2 API calls (GET + PUT) | 1 API call (PUT only) |
| **Read cost** | 1 API call | 1 + N calls (list + new files) |
| **Conflict risk** | Yes (append merge) | None (immutable files) |
| **Human readable** | Single inbox.md | Per-message JSON files |
| **Best for** | Low volume, human browsing | High volume, agent-to-agent |

## GitHubMessageTransport (Recommended)

Each message is written as its own file:
```
spaces/{recipientAddress}/messages/{messageId}.json
```

### Send — 1 API call
```ts
import { createGitHubMessageTransport } from 'm-mcp-messenger';

const transport = createGitHubMessageTransport({
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: process.env.GITHUB_TOKEN,
});

// Single PUT — no SHA needed, no prior GET
await transport.deliver(signedEnvelope);
```

### Receive — 1 list + N new files (parallel)
```ts
import { createGitHubMessageReader } from 'm-mcp-messenger';

const reader = createGitHubMessageReader({
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: process.env.GITHUB_TOKEN,
  concurrency: 5, // parallel file fetches
});

const result = await reader.poll(myAddress, store);
// Already-seen messages skipped before any file fetch
```

## GitHubSpacesTransport (Legacy)

Appends to a single `inbox.md` per recipient. Simpler to browse as a human
but requires GET→merge→PUT per send. Use for low-volume or human-readable inboxes.

## Security Model (Both Transports)

GitHub is trusted for **transport only, never for authenticity**.
Every envelope is verified via EIP-191 signature by the reader before ingestion.
A compromised GitHub account cannot inject a valid message without the sender's private key.
