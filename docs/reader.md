# Inbox Reader

## Overview

The reader closes the delivery loop opened by `GitHubSpacesTransport`.
It polls a GitHub-hosted inbox file, parses envelope blocks, verifies signatures, and ingests valid messages into a local `MessageStore`.

## Usage

```ts
import {
  createGitHubSpacesReader,
  InMemoryMessageStore,
} from 'm-mcp-messenger';

const reader = createGitHubSpacesReader({
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: process.env.GITHUB_TOKEN,
});

const store = new InMemoryMessageStore();
const result = await reader.poll(myAddress, store);

console.log(`Found: ${result.found}`);
console.log(`Ingested: ${result.ingested}`);
console.log(`Rejected: ${result.rejected.length}`);
```

## Full send → receive cycle

```
Sender
  createSignedEnvelope()
  → mintCognitiveWorkToken()
  → attachToken()
  → recordOutbound(senderStore)
  → relayDeliver(envelope, policy, GitHubSpacesTransport)
  → confirmDelivery(senderStore)

Recipient
  reader.poll(myAddress, recipientStore)
  → parseEnvelopeBlocks()
  → parseEnvelope()
  → verifyEnvelope()          ← EIP-191, no server needed
  → store.put() as inbound
  → store.listInbox()
```

## Idempotent polling

Polling is safe to call repeatedly. Messages already in the store are skipped by ID.
This means you can poll on a timer without duplicating messages.

## Rejection handling

A rejected envelope never touches the store. Rejection reasons:
- Parse error: malformed JSON in the inbox file
- Missing required field: incomplete envelope
- Signature invalid: tampered content or wrong sender key

## Security

GitHub is trusted for storage and delivery timing only.
Every envelope is verified by its EIP-191 signature before ingestion.
A compromised GitHub account cannot inject a valid message without the sender's private key.
