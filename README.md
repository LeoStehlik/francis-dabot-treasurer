# Francis DaBot Treasurer

A small OpenClaw plugin that lets a dedicated Discord user account run a tightly allowlisted set of TipBot slash commands.

It exists because Discord bot accounts cannot invoke another bot's application commands. The plugin uses a separate, dedicated user account and exposes four narrow OpenClaw tools instead of a general Discord client.

> [!WARNING]
> Discord's user-client protocol is undocumented. Discord can change it, rate-limit it, or suspend the dedicated account. Never connect this plugin to a person's normal Discord account.

## What it exposes

- `tipbot_help`
- `tipbot_balance`
- `tipbot_balances`
- `tipbot_tip`, split into a local `prepare` step and a one-time `commit`

Tips are disabled by default. There is no arbitrary command execution, normal message sending, chat reading, withdrawal, swap, faucet, drop, role recipient, multi-recipient tip, `ALL`, or automatic retry after an uncertain submission.

## Safety model

- Pins the expected Discord user ID and rejects bot accounts.
- Discovers TipBot's current slash-command schemas and refuses to run if they drift from the allowlist.
- Restricts recipients, token symbols, and the maximum amount per tip.
- Consumes each short-lived confirmation before network I/O.
- Attempts an interaction submission once. A timeout after transmission is reported as `UNKNOWN` and is never retried automatically.
- Bounds, flattens, and redacts TipBot responses before returning them to OpenClaw.
- Writes optional JSONL receipts with mode `0600`; credentials and raw Gateway payloads are omitted.
- Does not modify OpenClaw core or the official Discord plugin.

## Requirements

- OpenClaw `2026.9.7`
- Node.js `24.22.1` via `.nvmrc` (`>=24.16.0` supported)
- A dedicated Discord user account created manually
- A TipBot installation visible to that account
- A SecretRef provider for the Discord user token

## Build and verify

```bash
nvm use
npm ci
npm run verify
npm pack --dry-run
```

`npm run verify` checks formatting, lint, strict TypeScript types, all tests, and a clean build. The package entry point is compiled to `dist/index.js`.

## Configuration

Start with [`config.example.json`](./config.example.json). Every Discord snowflake in that file is a placeholder.

The important fields are:

- `token`: an OpenClaw SecretRef. Never store the resolved user token in the repository.
- `expectedUserId`: the one dedicated non-bot account allowed to connect.
- `guildId`: the server used to discover TipBot's live command schemas.
- `contextId`: the Discord channel or DM where the interaction is submitted.
- `interactionMode`: `dm` for the proven TipBot route, or `guild` where supported.
- `tipBotApplicationId`: the exact TipBot application ID.
- `allowedRecipientIds`: the only accounts that can receive tips.
- `allowedTokenSymbols`: the only token symbols the tools accept.
- `tipEnabled`: defaults to `false`.
- `maxPerTip`: a hard per-token ceiling, required when tips are enabled.
- `receiptPath`: an absolute private path outside the repository.

At startup the plugin verifies `/users/@me`, validates the discovered command schemas, then opens the Discord Gateway session. The OpenClaw tools remain unavailable until that sequence succeeds.

## Activation order

1. Create the dedicated Discord account manually. Do not automate registration, login, MFA, QR handling, token extraction, or refresh.
2. Open the intended TipBot context and discover the account, guild, channel, application, and recipient IDs.
3. Store the Discord user token through an OpenClaw SecretRef provider.
4. Install the packed plugin into a disposable OpenClaw configuration first.
5. Inspect the loaded tools and run a read-only `/help` or `/balances` canary.
6. Enable tipping only after setting recipient allowlists and realistic caps.

## Runtime verification

[`scripts/verify-package-runtime.sh`](./scripts/verify-package-runtime.sh) installs a packed archive into a disposable OpenClaw state directory and inspects the loaded plugin. It uses placeholders only and does not connect to Discord.

```bash
./scripts/verify-package-runtime.sh /absolute/path/to/francis-discord-user-tipbot-0.1.0.tgz
```

## Rollback

Disable or uninstall `discord-user-tipbot`, remove its configuration and SecretRef binding, stop its service, and verify that the official OpenClaw Discord plugin still loads independently.

## Project status

Experimental and deliberately narrow. The read-only command path and TipBot transfers have been exercised with a dedicated account, but Discord can break the underlying protocol without notice.

This project is unofficial and is not affiliated with Discord, TipBot, or OpenClaw.
