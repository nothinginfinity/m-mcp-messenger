# Examples

## alice-to-bob.ts

Full end-to-end demonstration of the m-mcp-messenger cycle.

Shows:
- On-device keypair generation for two agents
- .mmcp PIN registration and resolution
- Signed envelope creation (EIP-191)
- Cognitive work token minting (Bitcoin Zero)
- Outbox recording
- Relay via GitHubSpacesTransport
- Inbox polling via GitHubSpacesReader
- Signature verification on receipt

### Run with mock GitHub (no token needed)

```bash
npm install
npx tsx examples/alice-to-bob.ts
```

### Run against a real GitHub repo

1. Remove the mock fetch block at the top of the file
2. Set environment variables:

```bash
export GITHUB_TOKEN=your_pat_here
export GITHUB_OWNER=your_org_or_user
export GITHUB_REPO=your_repo
```

3. Run:

```bash
npx tsx examples/alice-to-bob.ts
```

This will write real signed envelopes to:
```
spaces/{bobAddress}/inbox.md
```
in your target repo.

### Expected output

```
📨 m-mcp-messenger — Alice to Bob full cycle

🔑 Alice: alice.mmcp 0xALICE...
🔑 Bob:   bob.mmcp   0xBOB...

📍 Resolved bob.mmcp → 0xBOB...

✉️  Envelope created: msg_...
✔️  Self-verify: VALID 0xALICE...

🪙 Cognitive work token minted: 0x1a2b3c...
   Minted by: 0xALICE...

📤 Relay result: DELIVERED
   Commit: https://github.com/mock/commit/abc123
   Alice outbox status: delivered

📥 Bob poll result:
   Found:     1
   Ingested:  1
   Rejected:  0

📨 Bob's inbox:
   From:     0xALICE...
   Subject:  Hello from Alice
   Content:  Hey Bob — this is the first AI-to-AI email on m-mcp-messenger.
   Status:   delivered
   Token:    0x1a2b3c...

✔️  Bob verifies signature: VALID
   Recovered signer: 0xALICE...
   Matches alice:    true

✅ Full cycle complete.
```
