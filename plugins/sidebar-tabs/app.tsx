import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "./feedback.css";
import "./tabs.css";
import { ModeToggleListener, requestModeToggle, TabsHost } from "./host.tsx";
import { NavTiles } from "./nav-tiles.tsx";
import { navigationSlot } from "./nav-runtime.ts";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({ id: "tabs", title: "Вкладки сайдбара",
    description: "Сессии и другие представления плагинов во вкладках; кнопка в футере возвращает штатный список.", component: TabsHost });
  // bb 0.46 replaced the sidebar navigation with its own rail and removed this slot: without it the tiles are not
  // registered, and the thread list (Сессии) still is — an exception here would have dropped the whole plugin.
  navigationSlot(app.slots)?.({ id: "tiles", title: "Плитки разделов",
    description: "Разделы плагинов рядом плиток: перетаскивание переставляет, за край сайдбара — открывает рядом; настройка — что показывать.", component: NavTiles });
  app.slots.experimental_appOverlay({ id: "list-mode-toggle", component: ModeToggleListener });
  app.experimental_sidebarFooter.register({ kind: "action", id: "list-mode", label: "Список: мои ↔ штатные", icon: "ListView", onActivate: requestModeToggle });
});
