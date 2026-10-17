// bb-plugin-manifest — frontend (EP-069..EP-071, docs/outreach/bb-plugin.md).
//
// Left: «Поставщики» — a tab of the sidebar-tabs host (contract v1); without
// the host the registry opens from the «Аутрич» navigation item.
// Centre: the plugin page — the chat of the selected organisation.
// Right: the «Карточка» fixed tab — the organisation's card (same subPath).
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { CardTab } from "./ui/CardTab";
import { ConnectSection } from "./ui/ConnectSection";
import { PANEL_ID, PANEL_PATH } from "./ui/hooks";
import { OutreachPage } from "./ui/OutreachPage";
import { SidebarView } from "./ui/SidebarView";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: PANEL_ID,
    title: "Аутрич",
    icon: "Globe",
    path: PANEL_PATH,
    component: OutreachPage,
    fixedTabs: [{ panelId: PANEL_ID, id: "card", title: "Карточка", icon: "IdCard", layout: "flush", component: CardTab }],
  });
  app.slots.experimental_appOverlay({ id: "sidebar-view", component: SidebarView });
  app.slots.settingsSection({
    id: "connect",
    title: "Подключение к Manifest",
    description: "Вход по email и паролю для плагина; данные и права — в Manifest.",
    component: ConnectSection,
  });
});
