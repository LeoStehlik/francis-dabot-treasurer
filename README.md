# Francis DaBot Treasurer

A standalone OpenClaw `2026.9.7` tool plugin for four allowlisted TipBot slash commands through one dedicated Discord user account.

This uses Discord's undocumented user-client protocol. Discord can break it or suspend the dedicated account. It is not a general Discord client and must never use a person's ordinary account.

The repository contains no live account IDs, server IDs, credentials, receipts, or runtime configuration. Keep all of those outside the checkout.

## Tools

- `tipbot_help`
- `tipbot_balance`
- `tipbot_balances`
- `tipbot_tip` with `prepare` then one-time `commit`

`tipbot_tip` is disabled by default. There is no arbitrary command tool, chat reading, ordinary message sending, withdrawal, swap, faucet, drop, role recipient, multi-recipient, `ALL`, or automatic retry after an uncertain submission.

## Build

```bash
nvm use
npm ci
npm run verify
npm pack --dry-run
```

Node is pinned in `.nvmrc`. `npm run verify` runs formatting, lint, strict type checking, tests, and a clean build.

The package entry is built JavaScript at `dist/index.js`. The official `@openclaw/discord` plugin and OpenClaw core are not modified.

## Configuration

Start from `config.example.json`. Replace every placeholder with read-only discovered IDs. `guildId` is used only to discover TipBot's live command schema. For the proven route, set `interactionMode` to `dm` and `contextId` to the dedicated account's DM channel with TipBot. `token` must remain a SecretRef in source configuration; OpenClaw resolves it only in the active runtime snapshot. Never paste the user token into chat, logs, shell arguments, fixtures, or a repository.

Startup verifies `/users/@me`, rejects a different account or any bot account, discovers the live application-command index, validates all four schemas, then opens the Gateway session. Tool factories return no tools until this sequence passes.

## Safe activation sequence

1. Create a dedicated Discord account manually. Do not automate login, MFA, QR, registration, extraction, or refresh.
2. Open a DM with TipBot, then read the live user ID, discovery guild ID, DM context ID, TipBot application ID, and command schemas.
3. Store the user token through an OpenClaw SecretRef provider.
4. Install the packed plugin into a disposable OpenClaw config and inspect it.
5. Run a separately approved read-only `/help` canary.
6. Keep tips disabled until another explicit approval defines recipient, token, amount, cap, and maximum loss.

## Receipts and rollback

Prepare and commit receipts are appended as mode `0600` JSONL. They contain normalized non-secret inputs and correlation IDs, never the token or raw Gateway payloads.

Rollback: disable or uninstall `discord-user-tipbot`, remove its config/SecretRef binding, stop its service, and verify the official `discord` plugin remains loaded. The packages are independent.
