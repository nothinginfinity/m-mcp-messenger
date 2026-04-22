# Inbox Reader

## Overview

The reader polls a GitHub-hosted message directory, verifies signatures,
and ingests valid messages into a local `MessageStore`.

Two optimizations make polling fast and cheap:
1. **GitHub Tree API** — one call returns the full message directory subtree
2. **ReadCache** — persistent set of seen IDs; skips fetching already-known files

## API Call Cost

| Poll state | Calls |
|---|---|
| Warm, no new messages | **2** (tree ref + tree fetch) |
| Warm, K new messages | **2 + K + 1** (tree + K files + cache save) |
| Cold (no cache), K messages | **1 + K + 1** (tree + K files + cache save) |
| Empty inbox | **2** |

After the first successful poll, all seen messages are cached and cost zero to skip.

## Usage

```ts
import {
  createGitHubMessageReader,
  createGitHubReadCache,
  InMemoryMessageStore,
} from 'm-mcp-messenger';

const cache = createGitHubReadCache({
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: process.env.GITHUB_TOKEN,
});

const reader = createGitHubMessageReader({
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: process.env.GITHUB_TOKEN,
  readCache: cache,   // ← plug in persistent cache
  concurrency: 5,
});

const store = new InMemoryMessageStore();
const result = await reader.poll(myAddress, store);

console.log(`Found: ${result.found}`);
console.log(`Ingested: ${result.ingested}`);
console.log(`Skipped: ${result.skipped}`);
console.log(`API calls: ${result.apiCalls}`);
```

## ReadCache

The `ReadCacheStore` interface is pluggable:

```ts
import { createInMemoryReadCache, createGitHubReadCache } from 'm-mcp-messenger';

// Session-scoped (default) — warms up within one process lifetime
const cache = createInMemoryReadCache();

// GitHub-backed — persists across sessions, survives restarts
const cache = createGitHubReadCache({ owner, repo, branch, token });
```

The GitHub-backed cache lives at `spaces/{address}/.read-cache.json`.
It is a plain JSON array of message IDs.

## Security

GitHub is trusted for storage and delivery timing only.
Every envelope is verified by its EIP-191 signature before ingestion.
The read cache only stores message IDs — never envelope content.
A poisoned cache can cause messages to be skipped but cannot cause
an invalid message to be ingested.
