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
import { MailPage } from "./ui/mail/MailPage";
import { LetterDirective } from "./ui/mail/LetterView";
import { MailingDirective } from "./ui/mail/MailingView";
import { MAIL_ID, MAIL_PATH } from "./ui/mail/common";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: PANEL_ID,
    title: "Аутрич",
    icon: "Globe",
    path: PANEL_PATH,
    component: OutreachPage,
    fixedTabs: [{ panelId: PANEL_ID, id: "card", title: "Карточка", icon: "manifest/id-card", layout: "flush", component: CardTab }],
  });
  // W-15: дашборд аутрича с темами-чатами; карточка — по цели вкладки.
  app.slots.navPanel({
    id: DASHBOARD_ID,
    title: "Дашборд аутрича",
    icon: "manifest/dashboard",
    path: DASHBOARD_PATH,
    component: DashboardPage,
    headerContent: TopicBar,
    experimental_sidebarAccessory: AttentionAccessory,
    fixedTabs: [{ ...DASH_CARD_TAB, title: "Карточка", icon: "manifest/id-card", layout: "flush", component: DashCardTab }],
  });
  // W-16: почта — шаблоны (с чатом по шаблону), юрлица и отправители, неразобранные входящие.
  app.slots.navPanel({ id: MAIL_ID, title: "Почта аутрича", icon: "Mail", path: MAIL_PATH, component: MailPage });
  app.slots.messageDirective({ id: "manifest-companies", component: CompaniesDirective });
  app.slots.messageDirective({ id: "manifest-batch", component: BatchDirective });
  // W-17: письмо организации «как уйдёт» — черновик из Manifest, обновляется после правки агента.
  app.slots.messageDirective({ id: "manifest-letter", component: LetterDirective });
  // W-17: рассылка — одно письмо, много получателей, письмо каждого «как уйдёт».
  app.slots.messageDirective({ id: "manifest-mailing", component: MailingDirective });
  app.slots.experimental_appOverlay({ id: "sidebar-view", component: SidebarView });
  app.slots.settingsSection({
    id: "connect",
    title: "Подключение к Manifest",
    description: "Вход по email и паролю для плагина; данные и права — в Manifest.",
    component: ConnectSection,
  });
});
