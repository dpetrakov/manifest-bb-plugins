# Changelog

All notable changes to the plugins in this repository. Versions follow
[Semantic Versioning](https://semver.org/). Releases of the `manifest` plugin are
tagged `manifest/vX.Y.Z`.

## manifest 0.7.0

Sending letters, statuses and replies (needs Manifest with W-20).

- «Отправить» on a letter and «Отправить N» on a mailing — in the chat chip and in the
  widget on the right — always behind a confirmation: to whom, from whom, sandbox or live,
  pace. Without the `outreach.send` right the buttons are inactive with the reason. The
  agent has no tool to send, cancel or stop; Manifest refuses it as well.
- A sent letter is an object with a live status (queued, sent, bounced, duplicate,
  cancelled) and the supplier's replies; «Отменить» while it is queued. A mailing shows
  progress (sent, queued, bounced, replies, unsubscribes), the expected end by the quota
  and «Остановить».
- Replies: «Ответить» on an inbound message or a letter starts a «Re: …» draft in the
  organisation's card; the agent helps with the text, the person sends it.
- Live statuses: the plugin asks Manifest what changed every 45 s and refreshes widgets
  and old chips in the chat.
- Sandbox letters run the whole flow — a touch marked «песочница», the status, the
  cadence step, the reply — and stay out of the metrics; «Убрать следы» in the card rolls
  the organisation back to its state before the test.
- Denser widgets: priority and status in one row (two only in a narrow panel), the
  sender as one row, no explanatory prose in everyday work (hints moved to tooltips).

- The Manifest look for widgets and chips: object panels, section pages and chat chips are
  light Manifest surfaces in any bb theme (the dark bb theme included) — the backoffice
  palette, a 40 px grid on the panel background, white cards, the Manifest mark, status as
  a traffic-light dot with text, a teal «песочница» / black «бой» mode badge and a lime
  «ответ» badge for supplier replies.

## manifest 0.6.0

The outreach workspace: the chat in the middle, the object on the right. Requires bb 0.46.

- Every outreach chat is a native bb thread. What it works with — an organisation, a
  mailing, a mail template, a dashboard topic or an inbound message — is a tab of the
  thread's side panel, which opens by itself and follows the thread wherever it is
  opened from (the thread list, search, a notification).
- One object at a time with a trail: when the agent turns an agreed letter into a
  mailing, the mailing opens on the right and the same thread goes on with it;
  «← organisation» above the widget goes back. An object may have several chats
  («Чаты», «Новый чат» in the panel and on its page).
- Letter and mailing directives in the chat are compact links that open the object on
  the right; company lists open an organisation on the right of the same thread.
- Section pages are pults: the registry, an organisation, a mailing, a template or an
  inbound message on the whole screen («Развернуть»), with its chats. The dashboard
  page shows the full dashboard; «Чат темы» opens the topic chat with the dashboard on
  the right.
- Widgets adapt to the narrow panel, phones and the whole screen by their own width;
  controls are at least 40 px tall on touch screens.
- The agent works with what is on the right (`manifest_focus_get`,
  `manifest_focus_open`) and may change only objects of its thread's chain.

## manifest 0.5.1

- The border of the switched-on suppliers button is a deeper shade of its own soft
  green instead of black, like the other switched-on footer buttons.
- A mailing can be cancelled before it is sent: «Удалить рассылку» in the mailing view
  (with a confirmation) or the agent on an explicit request. It is deleted completely,
  with its recipients; a sent mailing can't be deleted.

## manifest 0.5.0

The suppliers list is the plugin's own. Requires bb 0.46.

- «Потенциальные поставщики» is now a sidebar list of the `manifest` plugin with a
  button in the sidebar footer, tinted in Manifest's soft green like its rail
  sections. The button switches the sidebar between the suppliers and the previous
  list; opening «Аутрич» switches the suppliers on by itself.
- The `sidebar-tabs` host is no longer published here and the plugin no longer
  registers a tab in it. Remove `sidebar-tabs` installed from this repository unless
  another plugin needs it.
- The attention counter stays in the dashboard header (the tab badge is gone with the
  tab).

## manifest 0.4.0

The letter to an organisation, as it will go out. Needs a Manifest server with the
letter drafts (MCP tools `mail_draft_*`). Sending arrives in a later release.

- A letter draft per organisation, kept in Manifest: «Подготовить письмо» in the card
  takes a template; the agent in the company chat edits the draft on request.
- The letter is shown exactly as it will be sent — sender, recipient, subject, HTML with
  signature and footer, the template and whether it was edited, and what blocks sending —
  in the card and in the chat through the `::manifest-letter{company="…"}` directive,
  which refreshes after every edit.
- The agent skill: start from a template instead of writing a letter, keep placeholders
  (`{{company.name}}`, `{{signature}}`) as variables, change only what was asked, never
  paste the letter as text.
- Mailings: one letter for many organisations. «Разослать и другим» in the card (or the
  agent, from a company chat or a dashboard topic) turns the agreed draft into a mailing;
  recipients are added by id or by a registry filter (up to 300). The `::manifest-mailing`
  directive and the «Рассылки» tab show what will go and what will not (with reasons),
  and let you page through every recipient's letter as it will be sent.
- Text that adapts to the recipient: optional segments `[[ in {{company.city}}]]` and
  variants `[[ a || b || c ]]` — the first variant whose placeholders are all known.
- Fixed in Manifest: placeholders inside the signature are expanded.

## manifest 0.3.0

Outreach mail, part one: templates, senders and inbound, and readiness for bb 0.46.
Works on bb 0.45 and 0.46 with Manifest MCP contract 1; the mail page needs the
capability `outreach.mail`, without it the plugin works as 0.2.0. Sending mail arrives
in a later release.

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
