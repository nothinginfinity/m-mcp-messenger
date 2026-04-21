# Relay Transports

## Overview

A `RelayTransport` is a pluggable delivery mechanism for remote message relay.
It is only used when local delivery is not possible and the execution policy permits remote calls.

The transport interface is intentionally minimal:

```ts
interface RelayTransport {
  send(envelope: SignedEnvelope): Promise<RelayResult>;
}
```

The envelope is already signed before it reaches the transport.
The transport is responsible only for delivery — not for trust or verification.
The recipient always re-verifies the signature on receipt.

## Built-in transports

### `noopRelayTransport`

The safe default. Always returns `success: false` with a message pointing to the interface.
Used when no transport is configured.

### `GitHubSpacesTransport`

Delivers messages by appending signed envelopes to a GitHub-hosted inbox file.

Matches the existing `spaces/*/inbox.md` pattern used in Studio-OS-Chat and Studio-OS.

```ts
import { createGitHubSpacesTransport } from 'm-mcp-messenger';

const transport = createGitHubSpacesTransport({
  owner: 'nothinginfinity',
  repo: 'Studio-OS-Chat',
  branch: 'main',
  token: process.env.GITHUB_TOKEN,
  // Optional: override default path convention
  resolveInboxPath: (address) => `spaces/${address}/inbox.md`,
});
```

**Inbox path convention (default):**
```
spaces/{recipientAddress}/inbox.md
```

**Message format in inbox file:**
```markdown
<!-- m-mcp-messenger envelope msg_123 delivered 2026-04-21T07:00:00.000Z -->
```json
{
  "id": "msg_123",
  "from": "0xSENDER...",
  "to": "0xRECIPIENT...",
  ...
}
```

**Security model:**
- The envelope is signed by the sender (EIP-191) before transport
- GitHub commit provides delivery timestamp proof
- GitHub is trusted for transport only — never for authenticity
- Recipient verifies sender signature independently on read

## Implementing a custom transport

```ts
import type { RelayTransport } from 'm-mcp-messenger';

const myTransport: RelayTransport = {
  async send(envelope) {
    // your delivery logic here
    return { success: true, messageId: envelope.id };
  },
};
```

Any transport can be passed to `relayDeliver()`:

```ts
await relayDeliver(envelope, { allowRemote: true }, myTransport);
```

## Planned transports

- `IPFSTransport` — content-addressed delivery, no central server
- `WebSocketTransport` — real-time relay for online agents
- `StudioOSChatTransport` — direct integration with Studio-OS-Chat spaces
