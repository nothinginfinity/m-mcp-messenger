/**
 * Full end-to-end example: Alice sends a message to Bob.
 *
 * This script demonstrates the complete m-mcp-messenger cycle:
 *   1. Generate keypairs for alice and bob
 *   2. Register .mmcp PINs
 *   3. Alice composes and signs an envelope
 *   4. Alice mints a cognitive work token
 *   5. Alice records the message in her outbox
 *   6. Alice relays via GitHubSpacesTransport (mocked here)
 *   7. Bob polls his inbox via GitHubSpacesReader (mocked here)
 *   8. Bob verifies and ingests the message
 *   9. Both stores are inspected to confirm full cycle
 *
 * To run against a real GitHub repo:
 *   - Set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO in your environment
 *   - Remove the mockFetch section and use real fetch
 *   - Run: npx tsx examples/alice-to-bob.ts
 */

import {
  generateKeypair,
  toIdentity,
  createLocalResolver,
  registerPin,
  createSignedEnvelope,
  verifyEnvelope,
  mintCognitiveWorkToken,
  attachToken,
  InMemoryMessageStore,
  deliverLocal,
  recordOutbound,
  confirmDelivery,
  createGitHubSpacesTransport,
  createGitHubSpacesReader,
  relayDeliver,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// MOCK FETCH — simulates GitHub API for local testing
// Remove this block and set env vars to use a real GitHub repo
// ─────────────────────────────────────────────────────────────────────────────

let _inboxStore = '';

// Fake GitHub: 404 on first read, then accept writes, then serve written content
const mockFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  const method = options?.method ?? 'GET';

  if (method === 'GET') {
    if (!_inboxStore) {
      return { status: 404, ok: false, json: async () => ({}) } as unknown as Response;
    }
    const encoded = Buffer.from(_inboxStore, 'utf-8').toString('base64');
    return {
      status: 200, ok: true,
      json: async () => ({ content: encoded, sha: 'mock_sha_001' }),
    } as unknown as Response;
  }

  if (method === 'PUT') {
    const body = JSON.parse(options?.body as string);
    _inboxStore = Buffer.from(body.content, 'base64').toString('utf-8');
    return {
      ok: true,
      json: async () => ({ commit: { html_url: 'https://github.com/mock/commit/abc123' } }),
    } as unknown as Response;
  }

  return { status: 400, ok: false, json: async () => ({}) } as unknown as Response;
};

// Patch global fetch for this example
(globalThis as any).fetch = mockFetch;

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE START
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📨 m-mcp-messenger — Alice to Bob full cycle\n');

  // ── Step 1: Generate identities ──────────────────────────────────────────────────
  const aliceKeypair = generateKeypair('alice.mmcp');
  const bobKeypair = generateKeypair('bob.mmcp');
  const aliceIdentity = toIdentity(aliceKeypair);
  const bobIdentity = toIdentity(bobKeypair);

  console.log('🔑 Alice:', aliceIdentity.pin, aliceIdentity.address);
  console.log('🔑 Bob:  ', bobIdentity.pin, bobIdentity.address);

  // ── Step 2: Register PINs ────────────────────────────────────────────────────────
  const registry = new Map<string, string>();
  registerPin(registry, 'alice.mmcp', aliceKeypair.address);
  registerPin(registry, 'bob.mmcp', bobKeypair.address);
  const resolve = createLocalResolver(registry);

  const resolvedBob = await resolve('bob.mmcp');
  console.log('\n📍 Resolved bob.mmcp →', resolvedBob);

  // ── Step 3: Alice composes and signs envelope ─────────────────────────────────
  const envelope = await createSignedEnvelope(
    aliceKeypair.address,
    bobKeypair.address,
    {
      content: 'Hey Bob — this is the first AI-to-AI email on m-mcp-messenger.',
      contentType: 'text/plain',
      subject: 'Hello from Alice',
    },
    aliceKeypair.privateKey
  );
  console.log('\n✉️  Envelope created:', envelope.id);

  // ── Step 4: Verify envelope (Alice self-check before sending) ────────────────
  const selfCheck = verifyEnvelope(envelope);
  console.log('✔️  Self-verify:', selfCheck.valid ? 'VALID' : 'INVALID', selfCheck.recoveredAddress);

  // ── Step 5: Mint cognitive work token ───────────────────────────────────────
  const token = await mintCognitiveWorkToken(envelope, aliceKeypair.privateKey);
  const envelopeWithToken = attachToken(envelope, token);
  console.log('\n🪙 Cognitive work token minted:', token.tokenId.slice(0, 20) + '...');
  console.log('   Minted by:', token.mintedBy);

  // ── Step 6: Alice records outbound + relays via GitHub spaces ───────────────
  const aliceStore = new InMemoryMessageStore();
  await recordOutbound(envelopeWithToken, aliceStore);

  const transport = createGitHubSpacesTransport({
    owner: 'nothinginfinity',
    repo: 'Studio-OS-Chat',
    branch: 'main',
    token: process.env.GITHUB_TOKEN ?? 'mock_token',
  });

  const relayResult = await relayDeliver(
    envelopeWithToken,
    { allowRemote: true, isConnected: () => true },
    transport
  );

  console.log('\n📤 Relay result:', relayResult.success ? 'DELIVERED' : 'FAILED');
  if (relayResult.relayedTo) console.log('   Commit:', relayResult.relayedTo);
  if (relayResult.reason) console.log('   Reason:', relayResult.reason);

  await confirmDelivery(envelopeWithToken.id, aliceStore);
  const aliceOutbox = await aliceStore.listOutbox();
  console.log('   Alice outbox status:', aliceOutbox[0].status);

  // ── Step 7: Bob polls his inbox ────────────────────────────────────────────────
  const bobStore = new InMemoryMessageStore();
  const reader = createGitHubSpacesReader({
    owner: 'nothinginfinity',
    repo: 'Studio-OS-Chat',
    branch: 'main',
    token: process.env.GITHUB_TOKEN ?? 'mock_token',
  });

  const readResult = await reader.poll(bobKeypair.address, bobStore);
  console.log('\n📥 Bob poll result:');
  console.log('   Found:    ', readResult.found);
  console.log('   Ingested: ', readResult.ingested);
  console.log('   Rejected: ', readResult.rejected.length);

  // ── Step 8: Bob reads his inbox ───────────────────────────────────────────────
  const bobInbox = await bobStore.listInbox();
  if (bobInbox.length > 0) {
    const msg = bobInbox[0];
    console.log('\n📨 Bob\'s inbox:');
    console.log('   From:    ', msg.envelope.from);
    console.log('   Subject: ', msg.envelope.payload.subject);
    console.log('   Content: ', msg.envelope.payload.content);
    console.log('   Status:  ', msg.status);
    console.log('   Token:   ', msg.envelope.cognitiveWorkToken?.tokenId.slice(0, 20) + '...');

    // Final verify on Bob's side
    const bobVerify = verifyEnvelope(msg.envelope);
    console.log('\n✔️  Bob verifies signature:', bobVerify.valid ? 'VALID' : 'INVALID');
    console.log('   Recovered signer:', bobVerify.recoveredAddress);
    console.log('   Matches alice:   ', bobVerify.recoveredAddress?.toLowerCase() === aliceKeypair.address.toLowerCase());
  }

  console.log('\n✅ Full cycle complete.\n');
}

main().catch(console.error);
