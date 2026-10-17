import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "./feedback.css";
import "./tabs.css";
import { ModeToggleListener, requestModeToggle, TabsHost } from "./host.tsx";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({ id: "tabs", title: "Вкладки сайдбара",
    description: "Сессии и другие представления плагинов во вкладках; кнопка в футере возвращает штатный список.", component: TabsHost });
  app.slots.experimental_appOverlay({ id: "list-mode-toggle", component: ModeToggleListener });
  app.experimental_sidebarFooter.register({ kind: "action", id: "list-mode", label: "Список: мои ↔ штатные", icon: "ListView", onActivate: requestModeToggle });
});
