// bb-plugin-manifest — frontend (EP-069..EP-071, docs/outreach/bb-plugin.md).
//
// Left: «Поставщики» — a tab of the sidebar-tabs host (contract v1); without
// the host the registry opens from the «Аутрич» navigation item.
// Centre: the plugin page — the chat of the selected organisation.
// Right: the «Карточка» fixed tab — the organisation's card (same subPath).
// «Дашборд аутрича» (W-15): metrics, queue and topic chats; directives render
// live company lists and batch cards inside the agent's messages.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { CardTab } from "./ui/CardTab";
import { ConnectSection } from "./ui/ConnectSection";
import { PANEL_ID, PANEL_PATH } from "./ui/hooks";
import { OutreachPage } from "./ui/OutreachPage";
import { SidebarView } from "./ui/SidebarView";
import { DashCardTab, DashboardPage, TopicBar } from "./ui/dashboard/DashboardPage";
import { AttentionAccessory } from "./ui/dashboard/Accessory";
import { DASHBOARD_ID, DASHBOARD_PATH, DASH_CARD_TAB } from "./ui/dashboard/state";
import { BatchDirective, CompaniesDirective } from "./ui/directives";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: PANEL_ID,
    title: "Аутрич",
    icon: "Globe",
    path: PANEL_PATH,
    component: OutreachPage,
    fixedTabs: [{ panelId: PANEL_ID, id: "card", title: "Карточка", icon: "IdCard", layout: "flush", component: CardTab }],
  });
  // W-15: дашборд аутрича с темами-чатами; карточка — по цели вкладки.
  app.slots.navPanel({
    id: DASHBOARD_ID,
    title: "Дашборд аутрича",
    icon: "LayoutDashboard",
    path: DASHBOARD_PATH,
    component: DashboardPage,
    headerContent: TopicBar,
    experimental_sidebarAccessory: AttentionAccessory,
    fixedTabs: [{ ...DASH_CARD_TAB, title: "Карточка", icon: "IdCard", layout: "flush", component: DashCardTab }],
  });
  app.slots.messageDirective({ id: "manifest-companies", component: CompaniesDirective });
  app.slots.messageDirective({ id: "manifest-batch", component: BatchDirective });
  app.slots.experimental_appOverlay({ id: "sidebar-view", component: SidebarView });
  app.slots.settingsSection({
    id: "connect",
    title: "Подключение к Manifest",
    description: "Вход по email и паролю для плагина; данные и права — в Manifest.",
    component: ConnectSection,
  });
});
