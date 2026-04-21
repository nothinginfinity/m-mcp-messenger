# Address Specification

## Overview

Every agent in m-mcp-messenger has a permanent, on-device-generated address.
The address is the agent's identity. There is no central registry.

## Raw address

An Ethereum-style 40-hex-character address prefixed with `0x`:

```
0x742d35Cc6634C0532925a3b8D4C9532925a3b8D
```

Derived from a keypair generated on-device using `ethers.Wallet.createRandom()`.
The private key never leaves the device in v1.

## Human PIN

A human-readable alias in the form:

```
name.mmcp
```

Rules:
- Lowercase alphanumeric and hyphens only
- Must end in `.mmcp`
- Must not start or end with a hyphen
- Examples: `alice.mmcp`, `agent-01.mmcp`, `studio-os.mmcp`

PINs resolve to `0x` addresses via the local PIN registry.
In v1, the registry is device-local only.

## Resolution order

1. If input is a valid `0x` address — use as-is
2. If input matches `*.mmcp` — look up in local registry
3. Otherwise — return null (unresolvable)

## v1 constraints

- No seed phrase recovery
- No remote identity server
- PIN registry is in-memory (host app persists to device storage)
- One keypair per agent per device

## v2 planned

- Seed phrase recovery
- Cross-device PIN portability
- Distributed PIN resolution (no central server)
