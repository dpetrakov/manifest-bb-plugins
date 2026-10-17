# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use
[GitHub private vulnerability reporting](https://github.com/dpetrakov/manifest-bb-plugins/security/advisories/new)
for this repository. You will get an answer within a few working days.

## What the plugin handles

| Data | Where it lives | Notes |
|---|---|---|
| Plugin password | Typed once into bb settings, sent once to Manifest over HTTPS | Never stored by the plugin. Manifest stores only an Argon2id hash. |
| Access token `mfp_…` | Secret plugin setting on the bb backend | Manifest stores only its SHA-256 hash. Never sent to the browser. |
| Manifest URL the token was issued for | Plugin key-value storage on the bb backend | The token is not sent to any other URL. |
| Company ↔ thread links | Plugin key-value storage on the bb backend | Only ids. |
| Company data (cards, contacts, comments) | Manifest | Fetched on demand, not cached by the plugin. |

## Authentication

- **Separate plugin password.** Manifest's web interface signs in through Yandex.
  The plugin uses its own password per account, set by an administrator or by the
  user. At least 10 characters.
- **Hashing.** Argon2id (m = 19 MiB, t = 2, p = 1), PHC string format.
- **Exchange for a token.** `POST /api/plugin/auth/login` returns a random token
  (`mfp_` + 32 bytes). Tokens expire after 90 days without use; the expiry moves
  forward while the token is in use.
- **Revocation.** Signing out of the plugin revokes its token. A user can revoke their
  own devices and an administrator can revoke any device in Manifest. Changing or
  clearing the password revokes every token of the account. Deactivated users are
  rejected even with a valid token.
- **Brute force.** Five failed attempts per 15 minutes per email (and per client IP
  when Manifest knows the real client address). Attempts are reserved atomically
  before the password is checked, so parallel requests cannot bypass the limit. At
  most four password hashes are computed at a time; other requests get `503`.

## Authorization

- A token is accepted only on API routes that check a permission and on the MCP
  endpoint `/api/mcp`. It is rejected on session-only routes (changing one's own
  password, managing one's devices) and on administrator-only routes, even for an
  administrator account.
- The MCP server builds the tool list for every request from the user's current
  permissions: `outreach.view` gives read tools, `outreach.manage` adds write tools.
  Each call is checked again.
- **Agent scope.** The plugin gives Manifest tools to the agent only in a thread bound
  to a company. Write tools may change only that company, so text inside a card (for
  example a scraped source or a comment) cannot steer the agent into editing other
  companies. Read tools remain available across the registry.
- **Audit.** Agent changes are recorded in the company history as `email · агент BB`.
  Sign-ins, sign-outs, password changes and revocations are written to Manifest's
  audit log.

## Transport

- The plugin refuses `http://` URLs except `localhost` and `127.0.0.1`.
- If the Manifest URL in the settings is changed without signing in again, the old
  token is not sent to the new address.

## Things to be aware of

- **Model provider.** When you chat with the agent, the company data it reads is sent
  to the model provider that runs your bb thread, like any other content of that
  thread. Use a provider your organisation allows for this data.
- **Panel edits** (made by hand in the card) are attributed to the user without the
  «агент BB» mark; only calls made by the agent carry it.
