# Changelog

All notable changes to the plugins in this repository. Versions follow
[Semantic Versioning](https://semver.org/). Releases of the `manifest` plugin are
tagged `manifest/vX.Y.Z`.

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
