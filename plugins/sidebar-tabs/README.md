# sidebar-tabs — sidebar tab host for bb

A generic [bb](https://github.com/get-bb/bb) plugin that takes over the sidebar thread
list (slot `experimental_threadList`, provider `sidebar-tabs/tabs`) and shows the
views other plugins register there as tabs. The host knows nothing about the content
of a view: data, RPC, counters and styles stay with the plugin that owns the view.

In this repository it hosts the «Поставщики» (“Suppliers”) tab of the
[`manifest`](../manifest) plugin. Other plugins can add their own tabs through the
same contract.

The display name in bb is «Вкладки сайдбара» (“Sidebar tabs”); some labels in the
interface are in Russian.

## Install

```sh
bb plugin install https://github.com/dpetrakov/manifest-bb-plugins --plugin sidebar-tabs
```

The host shows only views registered by installed plugins. It does not show bb's own
thread list. To switch between the two:

- the sidebar footer action «Список: мои ↔ штатные» (“List: mine ↔ standard”), or
- the CLI:

  ```sh
  bb sidebar-tabs mode            # show the current mode
  bb sidebar-tabs mode standard   # bb's own thread list
  bb sidebar-tabs mode mine       # the tab host
  bb sidebar-tabs mode --json
  ```

The mode is the UI preference `sidebar.threadListProvider`, synced across windows:
“mine” is `__automatic__`, “standard” is `thread-list/thread-list`. Nothing else is
written.

## Behaviour

- **Tabs.** One tab per registered view. The tab strip appears only with two or more
  views; a single view takes the full height. Arrow keys, Home and End move between
  tabs. A view can name a Lucide icon from the host's built-in set and show a counter
  next to its label.
- **Which tab is selected.** Opening a view's own page (its navigation item or a path
  prefix it declares) selects that view; a view can also ask to follow thread
  opening. A manual pick changes only the tab, never the page. The selection belongs
  to the window, so other windows are not switched.
- **Nothing to show.** While views load, a skeleton; if none registers within 2.5 s,
  a message with a button that switches to bb's list.
- **Responsiveness.** Mode switches run once per window: repeated clicks are ignored,
  a progress indicator appears after 150 ms, a failure shows a toast with a retry.

“Mine” uses `__automatic__` rather than pinning `sidebar-tabs/tabs`: if the host is
disabled, bb falls back to its own list instead of showing an empty sidebar. This
requires the host to be the only installed third-party thread-list provider. If the
host does not appear within 4 s after switching, a toast says so.

## bb versions

The host works on bb 0.45 and 0.46. Versions before 0.3.1 fail on bb 0.46, which
removed the sidebar navigation slots and hooks: update the host before upgrading bb.

On bb **0.45** the host also registers «Плитки разделов» (“section tiles”), a row of
section icons that replaces bb's navigation; bb turns it on by itself when
`sidebar.navigationProvider` is `__automatic__`. To keep bb's navigation:

```sh
bb settings ui set sidebar.navigationProvider '"navigation/navigation"'
```

On bb **0.46** navigation is bb's own icon rail and the tiles are not registered.

## Writing a view

The contract is [`sidebar-tabs-contract.ts`](sidebar-tabs-contract.ts) (version 1).
Every participating plugin bundles a verbatim copy; the test
`tests/contract.test.mjs` compares the copies in this repository.

1. Copy `sidebar-tabs-contract.ts` into your plugin unchanged.
2. Register the view from an `experimental_appOverlay` component and render into the
   element the host publishes for it (`viewSlot(id, generation)`) through a React
   portal. Example: [`plugins/manifest/ui/SidebarView.tsx`](../manifest/ui/SidebarView.tsx).
3. Wrap the portal content in `data-bb-plugin="<pluginId>"`: plugin CSS is scoped by
   that attribute.
4. Route link clicks yourself (`experimental_useSidebarThreadActions().open`,
   `useBbNavigate`). bb's link routing does not see events from a portal, so a plain
   `href` click reloads the app.
5. When `isActive` becomes `false`, close your menus and popovers. Call
   `onNavigate()` after opening something (it closes the mobile drawer).
6. Put an error boundary around the content so that a crash stays inside the tab.

## Troubleshooting

- **Empty sidebar with “No thread list plugin is enabled”.** The preference names a
  list that no plugin provides. Run `bb sidebar-tabs mode mine`, or, without the
  host, `bb settings ui set sidebar.threadListProvider thread-list/thread-list`.
- **“Нет подключённых представлений” (“No views connected”).** No view plugin is
  installed or enabled. Check `bb plugin list` and `bb plugin logs <plugin>`; the
  button in the message switches to bb's list meanwhile.
- **The sidebar list disappeared after upgrading to bb 0.46.** The host is older than
  0.3.1. Run `bb plugin update sidebar-tabs`.
- **A tab is missing after a crash.** bb keeps a crashed overlay hidden until its
  plugin reloads with new code, is disabled and enabled again, or the window reloads.

## Development

```sh
npm ci
npm run check        # tab model and contract tests (Node.js 22.6+)
npx tsc --noEmit
bb plugin build .
```

## License

Proprietary. See [LICENSE](../../LICENSE) in the repository root.
