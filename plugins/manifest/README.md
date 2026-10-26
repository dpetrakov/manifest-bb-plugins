# manifest — Manifest outreach workspace for bb

A [bb](https://github.com/get-bb/bb) plugin that connects bb to **Manifest**, a private
operations service, and gives the team its supplier outreach workspace inside bb. The
plugin interface and the agent skill are in Russian.

- **Left: registry.** The plugin's own sidebar list «Потенциальные поставщики»
  (“Potential suppliers”): search and filters by region, country (with search inside
  the list), priority and status. A button in the sidebar footer, tinted in Manifest's
  soft green, switches the sidebar between the suppliers and the previous list;
  opening «Аутрич» (“Outreach”) switches it on by itself.
- **Right: card.** The «Карточка» (“Card”) tab: company details, countries, contact
  channels, contact persons, status, priority, comments and change history. Editing
  requires the `outreach.manage` permission in Manifest.
- **Middle: chat.** A bb thread bound to the company. The agent reads and edits it
  with Manifest tools within the user's permissions; each change is recorded in the
  history as «агент BB» (“bb agent”).

- **Dashboard (0.2.0).** The «Дашборд аутрича» page: today queue, funnel, regions,
  stagnation matrix, data quality and recent changes, with several topic chats. The
  topic agent filters the dashboard, shows live company lists and prepares bulk edits
  that a person applies or reverts.

Manifest is the MCP server and the only source of data and permissions. The plugin
keeps just an access token (a secret setting on the bb backend); the password is used
once to sign in.

## Install

Install the prebuilt package through the CLI connected to your bb server. An
agent can run this command on an enrolled machine: the CLI asks the bb server
to download and install the package on the server's computer.

```sh
bb plugin install npm:bb-plugin-manifest@latest
```

This route does not need Git or Xcode Command Line Tools. The first npm release
is 0.17.0. The existing Git source is also supported (and requires Git):

```sh
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
| `app.tsx` | UI slots: sidebar list and its footer button, navigation pages, «Карточка» tab, directives, settings section. |
| `lib/mcp-client.ts` | Minimal MCP client over HTTPS (`tools/call`, Bearer token, actor kind header). |
| `lib/tools.ts` | Agent tool schemas and the list of tools available to panels. |
| `ui/` | React components: registry list, filters, card, connection settings; `SuppliersList.tsx` and `suppliers.css` — the sidebar list, its switch and the footer button tone. |
| `ui/dashboard/` | The outreach dashboard: page, widgets, topic filter, attention counter. |
| `ui/directives.tsx` | Message directives `::manifest-companies` and `::manifest-batch`. |
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

### Publishing a prebuilt npm package

Keep the package name `bb-plugin-manifest` so the bb plugin id stays `manifest`.
The `files` allowlist includes the built bundles, their metadata, the plugin
sources, icons, skill, and proprietary license. Tests and local settings are
excluded. `npm pack` runs `prepack` to rebuild bundles for the package version.

```sh
npm run check
npm pack --dry-run
npm pack --pack-destination /absolute/path/to/release
```

Inspect the archive before publishing. It must contain `dist/server.js`,
`dist/server.meta.json`, `dist/app.js`, `dist/app.meta.json`, and `dist/app.css`;
both metadata files must match the package id and version. Log in with
`npm login --auth-type=web --registry=https://registry.npmjs.org/`, then publish
the reviewed archive:

```sh
npm publish /absolute/path/to/release/bb-plugin-manifest-X.Y.Z.tgz --access public --registry=https://registry.npmjs.org/
```

Complete any npm authentication prompt yourself. A successful `npm publish`
exit alone does not prove availability: the first release can temporarily show
only a `0.0.0-stage` placeholder. Check that the actual version is visible,
`latest` points to it, and `dist.integrity` matches the reviewed archive:

```sh
npm view bb-plugin-manifest@X.Y.Z version dist.integrity
npm view bb-plugin-manifest dist-tags
```

If a version is staged for maintainer approval, use the npm website or
`npm stage list` and `npm stage approve` (requires npm 11.15+ and 2FA). Do not
publish the same version again to work around a pending release. After checking
the registry, test a fresh npm install in a separate bb server.
Every subsequent release needs a new version. Users installed with `@latest` update with
`bb plugin update manifest`. An existing Git installation keeps tracking Git;
do not remove it just to switch sources, because removal deletes its settings.

## License

Proprietary, not open source. See [LICENSE](https://github.com/dpetrakov/manifest-bb-plugins/blob/main/LICENSE).
