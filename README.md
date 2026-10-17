# Manifest plugins for bb

![bb](https://img.shields.io/badge/bb-%E2%89%A5%200.45-1f2937)
![plugin SDK](https://img.shields.io/badge/plugin%20SDK-0.6.15-1f2937)
![MCP contract](https://img.shields.io/badge/Manifest%20MCP%20contract-v1-2563eb)
![UI language](https://img.shields.io/badge/UI-Russian-6b7280)
![License](https://img.shields.io/badge/license-proprietary-b91c1c)

Plugins for [bb](https://github.com/get-bb/bb), the agent orchestration IDE. They
bring the **supplier outreach** workspace of **Manifest** into bb: a registry of
potential suppliers in the sidebar, an editable company card on the right, and an AI
agent chat bound to each company in the middle.

> [!NOTE]
> **Who is this for.** Manifest is a private operations service for an importer of
> spare parts and power tools (orders, logistics, payments, price lists, supplier
> outreach). It is not open source and not offered as a product. These plugins are
> published so that the team can install them with `bb plugin install` from a
> public URL. They are useful only with access to a Manifest instance. If you build
> bb plugins yourself, the code may still serve as a worked example of a bb plugin
> that talks to an external system over MCP.

> [!NOTE]
> **Language.** The plugin interface and the agent skill are in Russian, because the
> team that uses Manifest works in Russian. This repository's documentation is in
> English.

## Contents

- [What it looks like](#what-it-looks-like)
- [Plugins](#plugins)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Installation](#installation)
- [Connecting to Manifest](#connecting-to-manifest)
- [Agent tools](#agent-tools)
- [Security](#security)
- [Updating and versioning](#updating-and-versioning)
- [Repository layout](#repository-layout)
- [Development](#development)
- [License](#license)

## What it looks like

```
┌──────────────────────┬─────────────────────────────────┬──────────────────────────┐
│ Sidebar              │ Main area                       │ Right panel              │
│ «Поставщики» tab     │ Chat with the bb agent,         │ «Карточка» tab           │
│                      │ bound to the selected company   │                          │
│ search               │                                 │ name, legal entity, kind │
│ region ▾ country ▾   │ "Find a phone number for the    │ countries covered        │
│ priority ▾ status ▾  │  Kenyan office and add it"      │ phones, emails, sites    │
│                      │                                 │ contact persons          │
│ P1 Company A  · DE   │ agent → outreach_get_company    │ status, priority         │
│ P2 Company B  · KE   │ agent → outreach_save_contact   │ comments                 │
│ P3 Company C  · IN   │                                 │ change history           │
│ …                    │ "Done: +254 … added."           │   «… · агент BB»         │
└──────────────────────┴─────────────────────────────────┴──────────────────────────┘
```

- **Registry (left).** All potential suppliers grouped by region and country, with
  full-text search and filters by region, country (the long country list has its own
  search box), priority P1–P5 and funnel status.
- **Card (right).** Company details, countries covered, contact channels, contact
  persons, status, priority, comments and change history. Editable for users who
  have the edit permission in Manifest.
- **Chat (middle).** A bb thread linked to the company. The agent reads and edits the
  company through Manifest tools, within the same permissions as the user. Every
  change it makes appears in the card's history marked «агент BB» (“bb agent”) and
  refreshes the card at once.

### Outreach dashboard (since 0.2.0)

```
┌─ Дашборд аутрича ─ [Весь реестр] [Напоминания] [Индия] [+ Тема] ───────┬───────────────────────┐
│ Topic filter: status = contacted · country = IN · no touch ≥ 7 days [×]│ Topic chat            │
│ ┌ Waiting for us ┐┌ Overdue ┐┌ No next step ┐┌ Due today ┐┌ Ready ┐    │ You: who needs a      │
│ │       2        ││    5    ││      3       ││     1     ││  12   │    │ follow-up in India?   │
│ └────────────────┘└─────────┘└──────────────┘└───────────┘└───────┘    │ Agent: 5 companies    │
│ ┌ Today queue ──────────────────┐ ┌ What changed since last visit ┐    │ ┌ live list ─────────┐│
│ │ Dealer X · follow-up #1,       │ │ THK · status → replied        │    │ │ Dealer X · IN · 9d ││
│ │            3 days overdue      │ │ ZETA · touch ← email          │    │ └────────────────────┘│
│ └────────────────────────────────┘ └──────────────────────────────┘    │ ┌ batch: next step ──┐│
│ ┌ Funnel ─────┐ ┌ Regions ─────┐ ┌ Stagnation: status × days ┐        │ │ 5 companies  [Apply]││
└─────────────────────────────────────────────────────────────────────────┴───────────────────────┘
```

- **Today queue.** Companies that replied and wait for us, overdue next steps, steps due
  today, and companies ready but not yet contacted — each row with the reason it is
  there. This is also what the agent answers to “who needs a reminder?”.
- **Charts.** Process checks, the funnel with drop-off by reason, regions stacked by
  stage, a stagnation matrix (status × days since the last touch), data quality and
  activity. Numbers are per company; percentages appear only when the base is at
  least 20. Every tile and bar filters the topic; every row opens the card.
- **Topics.** Several agent chats on the dashboard, each with its own filter, kept as
  bb threads in the «Аутрич» section. The agent changes the topic filter, inserts live
  company lists into its replies, and prepares bulk edits as **batches**: a preview of
  every field change that a person applies (and can revert) with a button. The agent
  cannot apply a batch itself.
- **Attention counter.** “Waiting for us + overdue” on the «Поставщики» tab and the
  dashboard navigation item.

The dashboard needs a Manifest server with the outreach work layer (touches, next steps,
queue, metrics); the plugin detects it through `manifest_whoami.capabilities`.

## Plugins

| Plugin | Version | What it does |
|---|---|---|
| [`manifest`](plugins/manifest) | 0.2.0 | The outreach workspace: registry, card, company chat, outreach dashboard with topic chats, agent tools, connection settings. |
| [`sidebar-tabs`](plugins/sidebar-tabs) | 0.2.1 | A generic host that turns bb's sidebar thread list into tabs filled by other plugins. `manifest` puts its registry there as the «Поставщики» (“Suppliers”) tab. |

`sidebar-tabs` is optional. Without it the registry opens from the «Аутрич»
(“Outreach”) item in the bb navigation, and bb's own thread list stays untouched.

## How it works

```mermaid
flowchart LR
  subgraph bb["bb (your machine or server)"]
    UI["Plugin UI<br/>registry · card · settings"]
    Agent["bb agent<br/>in the company thread"]
    Backend["manifest plugin backend<br/>stores the access token"]
    UI -- "plugin RPC" --> Backend
    Agent -- "native bb tools" --> Backend
  end
  subgraph M["Manifest"]
    MCP["MCP server<br/>/api/mcp"]
    Auth["Plugin sign-in<br/>/api/plugin/auth/*"]
    DB[("Postgres<br/>registry, rights, history")]
    MCP --> DB
    Auth --> DB
  end
  Backend -- "HTTPS · Bearer token<br/>MCP tools/call" --> MCP
  Backend -. "once: email + password → token" .-> Auth
```

- **Manifest is the single source of data and permissions.** It exposes an MCP server
  at `/api/mcp`. The list of tools a user gets depends on that user's permissions in
  Manifest, and each tool call is checked again on the server.
- **The plugin is an MCP client.** Its backend holds the access token and calls
  Manifest tools for the panels (through bb plugin RPC, so the token never reaches the
  browser) and for the agent (as native bb agent tools).
- **The agent works per company.** Manifest tools are given to the agent only in a
  thread that belongs to a company. Write tools may change only that company; read
  tools can look at the rest of the registry.
- **Contract versioning.** `manifest_whoami` returns `contract: 1`. If Manifest and the
  plugin disagree on the contract version, the plugin shows a message asking to update
  instead of failing in unpredictable ways.

## Requirements

- bb **0.45** or newer (plugin SDK 0.6.15).
- A Manifest account with the `outreach.view` permission; `outreach.manage` to edit.
- A **plugin password** set for that account in Manifest. It is separate from the web
  sign-in (Manifest's web interface uses Yandex sign-in).
- Network access from the bb backend to the Manifest URL over HTTPS. Plain `http://`
  is accepted only for `localhost` / `127.0.0.1` during development.

## Installation

```sh
# optional: the sidebar tab host
bb plugin install https://github.com/dpetrakov/manifest-bb-plugins --plugin sidebar-tabs

# the Manifest plugin
bb plugin install https://github.com/dpetrakov/manifest-bb-plugins --plugin manifest
```

bb builds the plugins from source on install; no prebuilt artifacts are committed.

> [!IMPORTANT]
> While `sidebar-tabs` owns the sidebar, it shows only the views that installed
> plugins register; with just this set that is the «Поставщики» tab. To get bb's own
> thread list back, use the sidebar footer action «Список: мои ↔ штатные»
> (“List: mine ↔ standard”) or run `bb sidebar-tabs mode standard`.
> `bb sidebar-tabs mode mine` switches back.

## Connecting to Manifest

1. **Get a plugin password.** In Manifest, an administrator sets it in
   «Пользователи и права» → «Плагин BB» (“Users and permissions” → “bb plugin”), or
   you set your own by clicking your name at the bottom of the Manifest menu.
2. **Sign in from bb.** Open *Settings → Plugins → Manifest → «Подключение к Manifest»*
   (“Connection to Manifest”) and enter the Manifest URL, your email and the plugin
   password.
3. The plugin exchanges the password for an access token once and forgets the
   password. The token is stored as a secret plugin setting on the bb backend.
4. **Sign out** in the same section to revoke the token. You or an administrator can
   also revoke any device from Manifest.

## Agent tools

Manifest's MCP server publishes these tools. The panels can call all of them. The agent
gets a set that depends on the kind of chat: in a **company chat** it reads and edits that
one company; in a **dashboard topic** it reads the whole registry and changes data only
through batch previews. The tools a session actually receives also depend on the user's
permissions.

| Tool | Agent | Permission | Purpose |
|---|:---:|---|---|
| `manifest_whoami` | | signed in | Current user, permissions, contract version. |
| `outreach_facets` | | `outreach.view` | Regions and countries with counts, dictionaries. |
| `outreach_list_companies` | ✓ | `outreach.view` | Search and filter the registry. |
| `outreach_get_company` | ✓ | `outreach.view` | Full card, including comments, history and source text. |
| `outreach_update_company` | ✓ | `outreach.manage` | Fields, status, tags, “do not contact”, manual priority; optimistic locking with `expected_updated_at`. |
| `outreach_save_contact` | ✓ | `outreach.manage` | Add or change a phone, mobile, WhatsApp, Telegram, fax, email or website. |
| `outreach_delete_contact` | ✓ | `outreach.manage` | Remove a contact channel. |
| `outreach_save_person` | ✓ | `outreach.manage` | Add or change a contact person. |
| `outreach_delete_person` | ✓ | `outreach.manage` | Remove a contact person. |
| `outreach_add_comment` | ✓ | `outreach.manage` | Comment on a company as the user. |
| `outreach_update_comment` | | `outreach.manage` | Edit or pin one's own comment. |
| `outreach_delete_comment` | | `outreach.manage` | Delete one's own comment. |
| `outreach_queue` | ✓ both | `outreach.view` | Today queue with a reason per row. |
| `outreach_metrics` | ✓ both | `outreach.view` | Dashboard metrics for a filter, with `as_of`. |
| `outreach_feed` | ✓ both | `outreach.view` | Changes since a moment. |
| `outreach_segments` | ✓ both | `outreach.view` | Saved team segments with live counts. |
| `outreach_cadence` | | `outreach.view` | Follow-up template. |
| `outreach_batch_get`, `outreach_batches` | ✓ topic | `outreach.view` | A batch and the batch journal. |
| `outreach_log_touch` | ✓ company | `outreach.manage` | Record an email, message, call, meeting, autoreply or bounce; the cadence proposes the next step. |
| `outreach_update_touch`, `outreach_delete_touch` | | `outreach.manage` | Fix or remove a touch. |
| `outreach_set_next_action`, `outreach_complete_next_action` | ✓ company | `outreach.manage` | Plan or close the next step. |
| `outreach_save_segment`, `outreach_delete_segment` | ✓ topic (save) | `outreach.manage` | Team segments. |
| `outreach_set_cadence` | | `outreach.manage` | Change the follow-up template. |
| `outreach_batch_preview` | ✓ topic | `outreach.manage` | Prepare a bulk edit (≤ 200 companies); changes nothing. |
| `outreach_batch_apply`, `outreach_batch_revert` | never | `outreach.manage` | Apply or revert a batch — refused when called by the agent. |
| `manifest_dashboard_show` | ✓ topic | — | Plugin-local: set the topic filter shown on the dashboard. |

The bundled agent skill [`manifest-outreach`](plugins/manifest/skills/manifest-outreach/SKILL.md)
explains the registry rules to the agent: the status funnel, when a reason is required,
how priority is calculated, how to record touches, and the two message directives —
`::manifest-companies{…}` (a live company list) and `::manifest-batch{id="…"}` (a batch
card with Apply / Revert).

## Security

In short:

- Manifest stores only an **Argon2id hash** of the plugin password and a **SHA-256
  hash** of each token.
- Tokens (`mfp_…`) live 90 days and are extended while in use. Changing the password
  revokes every token of the account.
- A token works only on permission-checked API routes and the MCP endpoint. It cannot
  change passwords, manage users or reach administrator-only routes.
- Sign-in attempts are rate-limited; password hashing runs with bounded concurrency.
- The plugin sends a token only to the Manifest URL it was issued for.
- Every change made through the agent is recorded in the company history as
  `email · агент BB`.

Data flow, threat model and how to report a vulnerability: [SECURITY.md](SECURITY.md).

## Updating and versioning

```sh
bb plugin outdated
bb plugin update manifest
bb plugin update sidebar-tabs
```

- Releases of the `manifest` plugin are git tags `manifest/vX.Y.Z` (semantic
  versioning). See [CHANGELOG.md](CHANGELOG.md).
- The Manifest MCP contract has its own version (currently **1**). A plugin release
  that needs a newer contract says so in the changelog.

## Repository layout

```
.
├── .bb/plugins.json            # bb plugin set manifest: lists both plugins
├── plugins/
│   ├── manifest/               # the Manifest plugin
│   │   ├── server.ts           #   backend: settings, sign-in, RPC, agent tools
│   │   ├── app.tsx             #   UI slots: sidebar view, page, card tab, settings
│   │   ├── lib/                #   MCP client, tool definitions, sidebar-tabs contract copy
│   │   ├── ui/                 #   React components (ui/dashboard — the outreach dashboard)
│   │   ├── skills/             #   agent skill «manifest-outreach»
│   │   └── tests/              #   vitest (server, UI) and node:test (MCP client)
│   └── sidebar-tabs/           # the sidebar tab host
├── CHANGELOG.md
├── LICENSE                     # proprietary license
└── SECURITY.md
```

## Development

This repository is a **published copy**. The `manifest` plugin is developed together
with Manifest in a private repository and copied here by a release script that runs
the checks and the bb build before every release. Pull requests are not accepted;
users of Manifest can report problems through issues.

Run the checks locally (Node.js 22.6 or newer):

```sh
cd plugins/manifest
npm ci
npm run check        # tsc --noEmit, vitest, node:test

cd ../sidebar-tabs
npm ci
npm run check        # tab model tests and contract copy comparison
```

Against a running Manifest you can also check the contract live:

```sh
cd plugins/manifest
MANIFEST_URL=https://manifest.example.com MANIFEST_EMAIL=you@example.com MANIFEST_PASSWORD=… \
  node --experimental-strip-types --test tests/mcp-client.test.mjs
```

Build as bb does on install: `bb plugin build plugins/manifest`.

## License

**Proprietary.** The source is public so that bb can install the plugins from a URL,
but this is not open-source software. Installing and running the plugins is allowed
only for users authorized by the copyright holder or covered by an agreement for the
Manifest service. Copying, modifying, redistributing or using the code with other
systems is not permitted. See [LICENSE](LICENSE).

Third-party packages keep their own licenses.
