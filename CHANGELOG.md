# Changelog

All notable changes to the plugins in this repository. Versions follow
[Semantic Versioning](https://semver.org/). Releases of the `manifest` plugin are
tagged `manifest/vX.Y.Z`.

## manifest 0.3.0

Outreach mail, part one: templates, senders and inbound, and readiness for bb 0.46.
Works on bb 0.45 and 0.46 with Manifest MCP contract 1; the mail page needs the
capability `outreach.mail`, without it the plugin works as 0.2.0. Sending mail arrives
in 0.4.0.

bb 0.46:

- sidebar-tabs 0.3.2 from bb-workbench: compatible with bb 0.46 (the 0.2.1 host
  crashed there on the first render). Update both plugins before upgrading bb.
- Own icons for the rail and the card tab («Дашборд аутрича», «Карточка»), declared in
  the manifest; bb has no built-in glyphs for them and showed a lightning bolt.
- The attention counter moved from the navigation item (not shown on the 0.46 rail)
  to the dashboard header; the «Поставщики» tab badge stays.
- Built against plugin SDK 0.6.49.

Mail:

- New page «Почта аутрича»: mail templates by audience with versions, legal entities
  and sender addresses with channel health and quota, default senders, and the inbox
  of replies that could not be matched to an organisation (link, spam, ignore).
- Template editor with a placeholder palette (`{{company.name}}`,
  `{{person.name | "Sir or Madam"}}`, …), a template view and a per-recipient view,
  “save” and “save as new”.
- Template topics: an agent chat next to the editor edits the draft
  (`manifest_template_draft`); a person saves the template with a button.
- The company card shows who writes to the organisation and what blocks sending; the
  sender can be changed there or by the agent in the company chat.
- Inbound mail is treated as untrusted data: shown as text, never executed, and the
  agent is told not to follow instructions from it.

## manifest 0.2.0

Outreach dashboard. Requires bb 0.45+, Manifest MCP contract 1 and, for the dashboard,
the Manifest capability `outreach.work`; without it the plugin works as 0.1.0.

- New page «Дашборд аутрича»: today queue with reasons, process checks, funnel with
  drop-off by reason, regions, stagnation matrix, data quality and activity, and
  “what changed since the last visit”. Clicks filter the topic or open the card.
- Topics: several agent chats on the dashboard, kept as bb threads in the «Аутрич»
  section, each with its own filter shown as editable pills; filters can be saved as
  team segments.
- The agent of a topic sets the dashboard filter, inserts live company lists
  (`::manifest-companies`) and prepares bulk edits as batches (`::manifest-batch`)
  that a person applies or reverts with a button. The agent cannot apply a batch.
- Company chats: the agent records touches and plans next steps; the card shows the
  next step, owner and recent touches, with quick touch logging.
- Attention counter on the «Поставщики» tab and the dashboard navigation item.

## manifest 0.1.0

First public release. Requires bb 0.45+ and Manifest MCP contract 1.

- Supplier registry in the bb sidebar («Поставщики» tab of `sidebar-tabs`), or as a
  page under the «Аутрич» navigation item when the host is not installed. Search and
  filters by region, country (with search inside the list), priority and status.
- Company card in the right panel: details, countries, contact channels, contact
  persons, status with a required reason for “rejected” and “do not contact”,
  priority, comments and change history. Editing follows Manifest permissions and
  uses optimistic locking.
- A bb thread per company with Manifest tools for the agent and the
  `manifest-outreach` skill. Writes are limited to the thread's company; changes
  appear in the card immediately.
- Sign-in with a Manifest plugin password exchanged for a revocable token; sign-out
  revokes it.

## sidebar-tabs 0.2.1

Included in this repository as the host for the «Поставщики» tab. Sidebar tabs
contract v1.
