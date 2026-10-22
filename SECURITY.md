# Threat model

## Protected assets

- Dedicated Discord user token.
- Correct dedicated-account identity.
- TipBot balance and at-most-once tip intent.
- Recipient, token, guild, channel and application allowlists.
- Existing official OpenClaw Discord bot configuration.

## Controls

- **Token disclosure:** source config accepts a SecretRef shape; manifest-owned secret materialization supplies the runtime string. Errors, results and Gateway content are bounded and redacted. Receipts omit credentials and raw payloads.
- **Account confusion:** startup calls `/users/@me`, requires the exact configured user ID and rejects bot accounts.
- **Duplicate spend:** prepare is local; commit consumes a short-lived HMAC token before network I/O. Interaction POST is attempted once. Timeout or disconnect after transmission returns `UNKNOWN` and is never retried automatically.
- **Schema drift:** command IDs and options are discovered. Application ID, names, option order/types/required flags and fixed choices must match the allowlist before submission.
- **Malicious response:** output is treated as untrusted text, flattened, redacted and truncated. Raw embeds/components are not returned.
- **Gateway reconnect:** bounded reconnect/resume exists for availability. Any transmitted pending interaction becomes `UNKNOWN` on disconnect.
- **Filesystem disclosure:** receipt parent directories use mode `0700`; the JSONL file is forced to `0600`.
- **Official bot isolation:** the package imports no private `@openclaw/discord` runtime and edits no OpenClaw core or official plugin files.

## Residual risks

- Discord user-client endpoints, payload fields and build-number expectations are undocumented and can drift without notice.
- Discord may rate-limit or suspend the dedicated account.
- A Discord 2xx plus missing Gateway response is inherently ambiguous.
- TipBot may change response formatting after accepting a command.
- A host compromise can still read an in-memory resolved token.
- The first real canary may uncover a protocol field absent from mock fixtures. That canary remains separately approved and read-only.
