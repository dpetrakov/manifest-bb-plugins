# Changelog

All notable changes to the plugins in this repository. Versions follow
[Semantic Versioning](https://semver.org/). Releases of the `manifest` plugin are
tagged `manifest/vX.Y.Z`.

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
