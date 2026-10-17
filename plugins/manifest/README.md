# manifest — Manifest outreach workspace for bb

A [bb](https://github.com/get-bb/bb) plugin that connects bb to **Manifest**, a private
operations service, and gives the team its supplier outreach workspace inside bb. The
plugin interface and the agent skill are in Russian.

- **Left: registry.** The «Поставщики» (“Suppliers”) tab of the
  [`sidebar-tabs`](../sidebar-tabs) host: potential suppliers with search and filters
  by region, country (with search inside the list), priority and status. Without the
  host the registry opens from the «Аутрич» (“Outreach”) navigation item.
- **Right: card.** The «Карточка» (“Card”) tab: company details, countries, contact
  channels, contact persons, status, priority, comments and change history. Editing
  requires the `outreach.manage` permission in Manifest.
- **Middle: chat.** A bb thread bound to the company. The agent reads and edits it
  with Manifest tools within the user's permissions; each change is recorded in the
  history as «агент BB» (“bb agent”).

Manifest is the MCP server and the only source of data and permissions. The plugin
keeps just an access token (a secret setting on the bb backend); the password is used
once to sign in.

## Install

```sh
bb plugin install https://github.com/dpetrakov/manifest-bb-plugins --plugin sidebar-tabs   # optional
bb plugin install https://github.com/dpetrakov/manifest-bb-plugins --plugin manifest
```

Then open *Settings → Plugins → Manifest → «Подключение к Manifest»* (“Connection to
Manifest”) and enter the Manifest URL, your email and your plugin password. The
password is set in Manifest by an administrator («Пользователи и права» → «Плагин BB»)
or by yourself (click your name at the bottom of the Manifest menu).

## Layout

| Path | What it is |
|---|---|
| `server.ts` | Backend: settings, sign-in and sign-out, RPC for the panels, agent tools, agent configuration per company thread. |
| `app.tsx` | UI slots: sidebar view, navigation page, «Карточка» tab, settings section. |
| `lib/mcp-client.ts` | Minimal MCP client over HTTPS (`tools/call`, Bearer token, actor kind header). |
| `lib/tools.ts` | Agent tool schemas and the list of tools available to panels. |
| `lib/sidebar-tabs-contract.ts` | Verbatim copy of the sidebar tabs contract v1. |
| `ui/` | React components: registry list, filters, card, connection settings. |
| `skills/manifest-outreach/` | Agent skill: registry rules and tool usage. |
| `PLUGIN_OVERVIEW.md` | Description shown inside bb (in Russian). |
| `tests/` | vitest (backend on a fake plugin host, UI with `renderSlot`) and `node:test` (MCP client). |

## Development

```sh
npm ci
npm run check          # tsc --noEmit + vitest + node:test
bb plugin build .      # dist/

# Optional: check the contract against a running Manifest
MANIFEST_URL=https://manifest.example.com MANIFEST_EMAIL=you@example.com MANIFEST_PASSWORD=… \
  node --experimental-strip-types --test tests/mcp-client.test.mjs
```

The plugin is developed together with Manifest and published to
[manifest-bb-plugins](https://github.com/dpetrakov/manifest-bb-plugins) by a release
script. The Manifest contract is version 1 (`manifest_whoami.contract`); on a mismatch
the plugin asks to be updated instead of failing.

## License

Proprietary, not open source. See [LICENSE](https://github.com/dpetrakov/manifest-bb-plugins/blob/main/LICENSE).
