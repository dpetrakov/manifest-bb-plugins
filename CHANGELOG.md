# Changelog

All notable changes to the plugins in this repository. Versions follow
[Semantic Versioning](https://semver.org/). Releases of the `manifest` plugin are
tagged `manifest/vX.Y.Z`.

## manifest 0.17.1

- The procurement rail restores the procurement sheet in its latest live chat, even
  when that chat last displayed an organisation or another object. A quick switch
  from outreach mail no longer opens a standalone sheet without a chat. With no
  live sheet chat, bb opens a new chat with the sheet in its side panel.
- Prebuilt releases are available as `bb-plugin-manifest` on npm (first release
  0.17.0). Install with `bb plugin install npm:bb-plugin-manifest@latest`; Git and
  Xcode Command Line Tools are not required. The bb CLI can run on an enrolled
  agent machine: it asks the connected bb server to install the package.

## manifest 0.17.0

Needs Manifest with `mail_mailing_recipient` and `mail_mailing_recipient_address` (core update,
no migration).

- The agent prepares the recipients of its mailing without a person opening each card: from the
  mailing chat it reads a recipient's card and adds contact persons, emails (the primary
  address included) and comments with the source. Every such call carries `mailing_id`;
  Manifest checks the organisation is on that mailing now and the mailing is still a draft
  (refused: not a recipient, removed, no such mailing, already sent). Status, «do not
  contact», deletions, touches and letter drafts of that organisation stay with a person.
- `manifest_focus_open {kind: company}` opens a recipient of a mailing of the thread on the
  right (Manifest confirms the recipient); the mailing goes to the trail, «← mailing» goes
  back. Other objects are still opened by a person. An organisation a person opens is an
  ordinary one of the chain again.
- The default address of a letter follows the organisation's **primary** email (and the
  person it belongs to) — before, the first email by creation date won and a new primary
  changed nothing. A recipient may be pinned to a person / email for one mailing
  (`mail_mailing_recipient_address`); a pin survives a new primary, and a pinned email that
  became invalid or bounced stops the letter with a reason instead of silently going to
  another address.
- Adding an email the card already has names its `contact_id` to edit instead of a bare
  «already exists».
- `outreach_list_companies` sorts by the share of the procurement sheet's **positions**
  (`sort=coverage_positions`) or volume (`coverage_volume`; `coverage` stays volume).
- The mailing chat sees the legal entities and channel (`mail_entities`) to check the sender
  and the live / sandbox mode.

## manifest 0.16.4

- Only the sandbox is marked: the «бой» badge is gone everywhere — live is the normal state.
  A mailing partly in the sandbox is marked «песочница».
- One way to move in «Почта аутрича» and «Закупочный лист»: the section's name and its tabs
  stay on top — also inside a template, a mailing or an inbound message (the tab of its
  list is active); «back» is one compact line «← list · what is open» with its actions on
  the right (they wrap on a phone). The section's name is no longer shown twice.
- «Рассылки» fit a narrow panel: the state and the counts go under the name.
- «Почта аутрича → Юрлица и отправители»: the signature ({{signature}}) and the footer of a
  legal entity are edited in the plugin (placeholders and the templates' markup work there);
  the template editor links to them («Изменить подпись и подвал →»).
- «Back» from an object of the mail names its list and opens the hub on it: a template →
  «← Шаблоны», a mailing → «← Рассылки», an inbound message → «← Неразобранные входящие»
  (before: «← Почта аутрича», always on «Рассылки»).
- «Manifest недоступен» names the cause instead of «fetch failed»: a connect timeout (the
  network of the bb server's machine does not reach Manifest), DNS, a refused connection or
  a certificate.
- Any file in a letter beside the RFQ (Manifest update, migration 00063): «+ Файл» uploads one
  from the computer, «✕» removes it — in a draft, a mailing, a template and for a single
  recipient of a mailing (remove the mailing's file for some companies or give them
  another). Up to 5 attachments and 7 MB per letter; the preview says when it is over.
- The agent attaches a file sent to it in the chat: `mail_file_from_thread {path}` reads it
  from the thread's own storage on the thread's host and uploads it to Manifest (the agent
  never carries the bytes); a path outside that storage is refused. Then the file goes into
  the attachments of a draft, a mailing or one recipient. A person sends.

## manifest 0.16.3

- The agent checks the tag «каталог проверен» and the comment «Каталог с сайта (дата): …»
  before looking for an organisation's catalog on its site, and leaves both after any try,
  so the same site is not crawled again for nothing.

## manifest 0.16.2

- The template editor in a chat's side panel keeps the panel header (the chain back to
  «Почта аутрича», «Чаты») and scrolls as one page; the letter preview no longer runs off
  the panel's bottom.
- «Закупочный лист» in «Источники»: a country's assortment and an organisation's catalog
  open one level deep instead of unfolding a row into a long sheet. Their bar sticks to the
  top: «← Сайты STIHL стран» / «← Каталоги организаций», the name and — for a draft —
  «Подтвердить» and «Отклонить» stay at hand while scrolling; table heads stick under it.
  Back returns to the same place in the list.
- «Покрытие»: the selected country and its sources stick over the matching, «↑ Карта» goes
  back to the map.
- Phone width: the tab bar scrolls sideways instead of overflowing, the countries and the
  catalogs fit the screen, the matched product is shown under the position instead of a
  one-letter column.
- A deleted chat no longer breaks a section: «Аутрич», «Дашборд аутрича», «Почта аутрича»
  and «Закупочный лист» return to their last chat only if it still opens; a deleted (or
  archived) one is forgotten and the section opens anew instead of «Failed to load
  thread». BB deletes threads softly, so the plugin now reads `deletedAt`, not only an
  error: «Чаты» of an object, dashboard topics, a template's chat and an old link to a topic
  skip deleted threads, and a deletion removes the thread from every link the plugin keeps.
- A potential supplier's card no longer shows supplier currency and «активен» (Manifest
  update): these fields come only with the role «Поставщик».

## manifest 0.16.1

- The map colours a country also by the organisations working there from another country
  (Manifest update): ANDREAS STIHL of South Africa serves Zambia, Botswana, Namibia… with the
  assortment of South Africa, so those countries get its coverage; the border is dotted and
  the tooltip says «через ANDREAS STIHL — сайт STIHL ЮАР». «Сверка по» for such a country
  offers that site too.

## manifest 0.16.0

- The procurement sheet as a letter attachment (Manifest update, migrations 00061–00062): a
  draft, a mailing — and each of its recipients — and a template choose «Вложение»: the RFQ
  type (none / what the catalog has / the whole sheet), whose catalog (as in the rating /
  regional — the STIHL site of its country / its own; a missing one is marked) and with or
  without quantities. Price and Availability are always there. The letter shows «📎 RFQ STIHL - MSG.xlsx · 28 поз. · …» with
  «Скачать»; a sent letter keeps the file as it went. The Excel is the format the buyer's
  suppliers know: OEM Part No · Description · Qty, pcs, with empty Price and Availability.
- The agent sets attachments of a draft (`mail_draft_attachments`) and of a mailing; a
  person sends.

## manifest 0.15.0

- A catalog is decided where it is seen: «Источники → Каталоги организаций» opens its
  contents — what it gives the sheet (the matching, with decisions) and what it has beyond
  the sheet — with «Подтвердить / Отклонить» above. Elsewhere (the card, «Покрытие»,
  «Проверить») a draft has «Проверить в источниках», a confirmed catalog a quiet «Каталог в
  источниках»; the sheet switches to the catalog and scrolls to it.
- «Проверить» compares what is needed with what is offered: doubtful choices are grouped by
  position — the position as the sheet has it (model, set, category, quantity, articles,
  reference price, the name in the sheet) on top, the candidates under it, one row per
  product with where it is, the doubt in a few words and «Тот же / ½ / Не то». Columns don't
  overlap; on a narrow panel the decision goes under the product.
- Battery starter sets (Starterset, Zestaw startowy, Aloitussarja, «+ AL 101») are sets, not a
  single battery (Manifest update).

## manifest 0.14.0

- The procurement sheet object is laid out by jobs: «Лист», «Покрытие», «Источники»,
  «Проверить N» (Manifest update, migration 00060).
- «Покрытие»: the map colours a country by its best source — the STIHL site or an
  organisation's own catalog (a draft gives the country a dashed amber border). «Сверка
  по» switches the matching between the country's site and the catalogs of organisations
  serving it; a draft catalog is confirmed or rejected right there. Each organisation of the
  country has «Сверка» next to «Рядом» and «Чат». A failed load of organisations says so and
  offers «Повторить» instead of «no organisations».
- «Проверить N»: drafts of catalogs and doubtful choices of every source, each with its
  source. A product without an article is decided by name, only in its catalog.
- «Источники»: STIHL sites of countries and organisations' catalogs — status, coverage,
  products, «Подтвердить / Отклонить», «Рядом».
- Manifest got faster: the matching remembers parsed product names (a recompute over 37
  countries parsed millions of names before).

## manifest 0.13.0

- An organisation's draft assortment counts at once, like an automatic choice of the
  matching (Manifest update, migration 00059): it is the organisation's current source,
  marked as a draft — a dashed amber frame on the percent in the list, a dashed amber circle
  on the map, «черновик» in the card. «Подтвердить» removes the mark; «Отклонить» brings the
  previous confirmed source back, or the countries.
- Ukraine is out of the country list.

## manifest 0.12.0

- An organisation's own assortment (EP-112): the card gets «Ассортимент» — what the
  rating is counted by (its countries' STIHL sites or its own source), its price list or
  site, and a draft with «Применить» / «Отклонить». «Загрузить прайс» takes XLSX/CSV.
- The agent can read an organisation's site and save the products as a draft
  (`assortment_company_draft`, only for the organisation of its chat); the preview says how
  many products the sheet uses and the coverage by the draft. A person applies it; from
  then on the organisation is rated by its own source instead of its countries.
- «Сверка»: the organisations of the selected country next to the lookup, with «Рядом»,
  «Чат» and the other countries each serves; the map stops growing on a wide page.
- The cluster of the selected country: a halo around the markers of the other countries its
  organisations serve — solid when they are all the organisations there, dashed when there
  are others too; the tooltip says «организаций Казахстана: 1 из 2». The fill (coverage)
  stays as it is.
- More STIHL sites (Manifest update): Belgium, Switzerland, Canada, Peru — named only in
  robots.txt; one page per product on multilingual sites.

## manifest 0.11.1

- The map tooltip stays inside the map: in its lower half it opens above the cursor, near
  the right edge — to the left of it (it went under the frame and was cut off).

## manifest 0.11.0

- «Сверка» opens with a world map instead of country chips: a country's fill is the
  coverage of the procurement sheet by its STIHL assortment, a hatched country has a STIHL
  site not loaded yet, a circle shows the organisations of the registry there (amber — one
  of them has its own catalog). Zoom to Europe, Asia, Africa, the Americas or Oceania; a
  lookup under the map selects any country. A country without data says what would give it
  (load the site, or the organisation's own price list).
- «Ассортимент стран»: the country's products look like the sheet — column headers, groups
  by category (accessories last), the model in full, a narrow article column, the name on
  the site as a link; the country row says «34 модели · 35 тов.» and when it was loaded.
- 25 more countries with a STIHL site (Manifest update): France, Italy, Spain and the rest
  of the EU sites, Ukraine, Japan, Mexico, Fiji — 34 in total.

## manifest 0.10.0

- Coverage of the procurement sheet (EP-108): every organisation gets the share of the sheet
  its countries' STIHL assortment covers (by volume — quantity × reference price — and by
  positions; the best of its countries). The left list shows it as a badge and sorts by it
  («Порядок → По покрытию листа»); the hover card explains it.
- «Сверка» — a tab of the «Закупочный лист» object: countries with their coverage, the
  sheet against a country (the product chosen for each position, full / partial with a
  reason / none) and «Проверить» — doubtful automatic choices of all countries. «Тот же
  товар», «Частично», «Не то», «Выбрать» another product of the model, «Вернуть
  автоматический»; a decision by the global product id applies in every country and the
  rating is recomputed at once.
- The agent reads `assortment_coverage`, `assortment_choices`, `assortment_queue`; decisions
  are a person's buttons.

## manifest 0.9.0

- «Ассортимент стран» — a tab of the «Закупочный лист» object (EP-107): the national STIHL
  sites as sources. «Загрузить» starts a background load in Manifest (the cordless product
  pages of the country, one page every 1.5 s) with live progress; «Применить» makes the
  finished snapshot current. A country row opens its assortment: models, kit mark, the
  country's article and price, a link to the product page.
- The agent reads `assortment_sources` and `assortment_items`; loading and applying are a
  person's buttons.
- Needs Manifest with `outreach.assortment`.

## manifest 0.8.1

- «Закупочный лист» has its own rail icon (it fell back to the outreach one).
- The sheet is a compact table with a sticky header: positions grouped by category with
  counts and quantities; columns follow the panel width — narrow: number, model (with a
  «набор» mark) and quantity; wider: the reference price; wide: articles.

## manifest 0.8.0

- One organisation with roles (ADR-051): a potential supplier and a supplier of
  procurement are one card. Roles «Потенциальный поставщик» / «Поставщик», the supplier's
  currency and «active» are set in the card; the list filters by role and marks suppliers;
  the hover card shows the role.
- «Закупочный лист» — a new rail and an object beside a chat: everything we need to buy
  (model, kit, category, every known article, quantity, reference price). Edit and cancel a
  position, add one, and load a CSV/XLSX file: a preview (new / changed / unchanged /
  errors) and «Применить» with the fingerprint of what you saw. Saving is a person's button;
  the agent reads the sheet (`procurement_needs`) and proposes a table to load.
- Needs Manifest with `procurement.sheet` and the rights «Закупки: просмотр/управление».

## manifest 0.7.9

- Fix: the «Почта аутрича» rail opened the last mailing's or template's chat instead of the
  mail hub (templates, mailings, legal entities, unmatched). Only the hub's chats count now;
  without one in this window the rail opens the hub's last chat or a new one.
- A mailing's, template's or inbound message's panel has «← Почта аутрича» back to the hub.

## manifest 0.7.8

- The «Manifest · рядом» tab looks different from the chat's own object: warm paper instead
  of the cool one and an amber bar «Рядом · чат о «…»» naming what the chat is about.
- «Сделать основной →» on that bar goes to the card's own chat (its last one, or bb's New
  thread screen), where it is the object. «Сделать объектом чата» is gone.

## manifest 0.7.7

- Fix «Рядом» from the left list: bb declines side-panel opens from the sidebar (it has no
  panel of its own), and the fallback opened the organisation's chat instead. The list now
  asks the open thread (its header action) or the New thread screen (its composer banner)
  to open the «Manifest · рядом» tab in their own panel; the chat is only the fallback where
  there is no panel at all.

## manifest 0.7.6

- «Рядом», a click in a dashboard selection and Cmd/Ctrl-click open the organisation in its
  own «Manifest · рядом» panel tab: bb reused the main object tab, so the card replaced the
  dashboard or the open organisation. The next organisation replaces the «рядом» tab.
- The hover card shows the three last touches (direction, channel, date, outcome, summary)
  and «и ещё N — в карточке»; the separate «Письмо» block is gone — a letter is a touch.

## manifest 0.7.5

- Hovering an organisation in the left list shows a compact card beside the row: priority,
  status, countries, the next step (overdue in red), touches with a «ответ» badge, owner,
  tags, then the last touch and the last letter with its status (loaded on show, cached
  until the organisation changes). Actions: «Рядом» (card in a separate panel tab) and
  «Чат» (the organisation's chat). Pointer devices only.
- Fix: in a dashboard chat on bb's New thread screen a click in the list did not open the
  card — the list now picks the panel of the screen it is on, and falls back to the
  organisation's chat where there is no side panel.

## manifest 0.7.4

- The dashboard filter drives the organisation list on the left: while a dashboard chat is
  open, the list shows its selection with a «Выборка дашборда: …» banner (opening the list
  if it was hidden). × unlinks it until the dashboard filter changes; another chat — the
  list's own filter. Each dashboard chat keeps its own selection.
- In a dashboard chat a click on an organisation opens its card in a separate panel tab next
  to the dashboard; Cmd/Ctrl-click goes to the organisation's chat.

## manifest 0.7.3

- «Почта аутрича» works like the dashboard: the rail opens the last mail chat or a new
  one with the mail hub on the right (templates, mailings, legal entities, unmatched
  inbound). A mailing, a template or a message opens its own chat with it on the right
  (or bb's New thread screen when it has none).
- Mailings are a table: state, mode, recipients, sent, queued, bounced, replies, updated.
- The New thread screen keeps one panel tab that follows the object instead of a new tab
  per click; the dashboard in that panel scrolls.
- A second object beside the chat: Cmd/Ctrl-click (or middle click) an organisation, or
  drag it out of the list towards the panel — it opens in a separate tab; «Сделать объектом
  чата» moves the chat to it.

## manifest 0.7.2

- One layout for every object: the chat in the middle, the object on the right in the bb
  side panel (resizable; whole screen — the panel's own ⤢). «Развернуть» is gone.
- An organisation without a chat opens bb's New thread screen with the card in its side
  panel and a «Новый чат: …» banner; the first message creates the thread, linked to the
  organisation — the same as an organisation with chats.
- The dashboard works the same way: the «Дашборд аутрича» rail opens the last dashboard
  chat or a new one, with the dashboard on the right; any number of chats about it, each
  with its own filter. «Темы» and their switcher are gone.
- The «Аутрич» rail only switches the list on the left; the middle stays with the chat.

## manifest 0.7.1

- The object panel no longer shows the object twice: inside the panel the widget drops
  its own header (organisation, mailing, inbound message) — the panel header names it.
- Dashboard «Что изменилось»: the top 8 changes; «Все изменения» opens the full list over
  the dashboard. Mail events read as words (letter, draft, sender, legal entity, sandbox).
- An organisation without an open chat opens like a thread: the new-chat composer (and
  its earlier chats) in the middle, the card on the right at the width of the thread panel;
  the first message opens the thread with the card still on the right. «Развернуть» shows
  the card on the whole width.
- 0.7.0 shipped twice under one version tag, so bb kept the first build; 0.7.1 carries
  the denser widgets and the sandbox flow of the second one.

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
