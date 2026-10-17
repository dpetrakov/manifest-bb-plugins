---
name: sidebar-tabs
description: Show or switch the owner's sidebar list between «мои» (sidebar-tabs host with Сессии and other plugin views) and «штатные» (bb's own list); troubleshoot an empty sidebar.
---

# Sidebar list mode: мои / штатные

The sidebar list belongs to the `sidebar-tabs` host. In «мои» it shows tabs for views that plugins register: «Сессии» from `sessions`, later «Документы». In «штатные» bb's own list is shown. The mode is one server-synced UI preference shared by every window:

| Mode | `sidebar.threadListProvider` |
|---|---|
| мои | `__automatic__` |
| штатные | `thread-list/thread-list` |

```sh
bb sidebar-tabs mode            # show
bb sidebar-tabs mode standard   # bb's list
bb sidebar-tabs mode mine       # sidebar tabs
bb sidebar-tabs mode --json
```

The owner normally switches with the footer button «Список: мои ↔ штатные». Change the mode only when the owner asks. Never switch it as a side effect of other work: it changes the sidebar in all of their windows.

Do not pin `sidebar-tabs/tabs` explicitly. If the host is then disabled, the sidebar shows «No thread list plugin is enabled». `__automatic__` falls back to bb's list by itself.

If the sidebar is empty or says no list plugin is enabled, the preference names a list that is not registered (for example the retired `sessions/sessions`). Run `bb sidebar-tabs mode mine`. If the host itself is missing, run `bb settings ui set sidebar.threadListProvider thread-list/thread-list`. If the host says «Нет подключённых представлений», check `bb plugin list` and `bb plugin logs sessions`.

Which tab is selected is per window and not scriptable; it follows the open thread or page.
