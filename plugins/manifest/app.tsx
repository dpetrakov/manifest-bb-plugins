// bb-plugin-manifest — frontend (EP-069..EP-071, docs/outreach/bb-plugin.md).
//
// Left: «Потенциальные поставщики» — the plugin's own sidebar thread list, switched
// on by a footer button (and by the «Аутрич» section); the button returns the
// previous list. No sidebar-tabs host since 0.5.0.
// W-18 (ADR-049): chats are native BB threads; the object of a thread (organisation,
// mailing, template, topic, inbound) is a tab of the thread's side panel. Plugin pages
// are pults: lists, an object on the whole screen, its chats and «Новый чат».
// «Дашборд аутрича» (W-15): metrics, queue and topic chats; directives render
// live company lists and batch cards inside the agent's messages.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ConnectSection } from "./ui/ConnectSection";
import { PANEL_ID, PANEL_PATH } from "./ui/hooks";
import { OutreachPage } from "./ui/OutreachPage";
import { FOOTER_LABEL, SuppliersList, SuppliersSwitch, requestSuppliersToggle } from "./ui/SuppliersList";
import "./ui/suppliers.css";
import "./ui/manifest/manifest.css";
import { DashboardPage } from "./ui/dashboard/DashboardPage";
import { AttentionAccessory } from "./ui/dashboard/Accessory";
import { DASHBOARD_ID, DASHBOARD_PATH } from "./ui/dashboard/state";
import { BatchDirective, CompaniesDirective } from "./ui/directives";
import { MailPage } from "./ui/mail/MailPage";
import { LetterChip, MailingChip } from "./ui/workspace/Chips";
import { MAIL_ID, MAIL_PATH } from "./ui/mail/common";
import { FocusHeader, ObjectPanel } from "./ui/workspace/ObjectPanel";
import { BESIDE_NEW_PANEL, BESIDE_PANEL, OBJECT_PANEL } from "./ui/workspace/state";
import { ComposeBanner, NEW_COMPANY_PANEL, NewCompanyPanel } from "./ui/workspace/compose";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: PANEL_ID,
    title: "Аутрич",
    icon: "Globe",
    path: PANEL_PATH,
    component: OutreachPage,
  });
  // W-15: дашборд аутрича с темами-чатами; карточка — по цели вкладки.
  app.slots.navPanel({
    id: DASHBOARD_ID,
    title: "Дашборд аутрича",
    icon: "manifest/dashboard",
    path: DASHBOARD_PATH,
    component: DashboardPage,
    experimental_sidebarAccessory: AttentionAccessory,
  });
  // W-16: почта — шаблоны (с чатом по шаблону), юрлица и отправители, неразобранные входящие.
  app.slots.navPanel({ id: MAIL_ID, title: "Почта аутрича", icon: "Mail", path: MAIL_PATH, component: MailPage });
  app.slots.messageDirective({ id: "manifest-companies", component: CompaniesDirective });
  app.slots.messageDirective({ id: "manifest-batch", component: BatchDirective });
  // W-17: письмо организации «как уйдёт» — черновик из Manifest, обновляется после правки агента.
  app.slots.messageDirective({ id: "manifest-letter", component: LetterChip });
  // W-17: рассылка — одно письмо, много получателей, письмо каждого «как уйдёт».
  app.slots.messageDirective({ id: "manifest-mailing", component: MailingChip });
  // Список поставщиков в сайдбаре и кнопка-переключатель в подвале (цвет — suppliers.css).
  app.slots.experimental_threadList({
    id: "suppliers",
    title: "Потенциальные поставщики",
    description: "Реестр Manifest вместо списка тредов; кнопка в подвале возвращает прежний список.",
    component: SuppliersList,
  });
  app.slots.experimental_appOverlay({ id: "suppliers-switch", component: SuppliersSwitch });
  app.experimental_sidebarFooter.register({
    kind: "action",
    id: "suppliers",
    label: FOOTER_LABEL,
    icon: "manifest/suppliers",
    onActivate: requestSuppliersToggle,
  });
  // W-18 (ADR-049): объект треда — во вкладке боковой панели родного треда BB; кнопка в
  // шапке треда показывает, что открыто, и сама открывает панель.
  app.slots.threadPanelAction({ id: OBJECT_PANEL, title: "Manifest", icon: "manifest/id-card", layout: "flush", component: ObjectPanel });
  app.slots.experimental_threadHeaderAction({ id: "focus", title: "Объект Manifest", component: FocusHeader });
  // Организация без чата открывается экраном нового треда BB: карточка — в его боковой
  // панели, над полем — баннер; первое сообщение создаёт тред, привязанный к организации.
  app.slots.experimental_newThreadPanelAction({ id: NEW_COMPANY_PANEL, title: "Manifest", icon: "manifest/id-card", layout: "flush", component: NewCompanyPanel });
  // A second object beside the main one (Cmd/Ctrl-click, «Рядом» in the list): its own tab.
  app.slots.threadPanelAction({ id: BESIDE_PANEL, title: "Manifest · рядом", icon: "manifest/id-card", layout: "flush", component: ObjectPanel });
  app.slots.experimental_newThreadPanelAction({ id: BESIDE_NEW_PANEL, title: "Manifest · рядом", icon: "manifest/id-card", layout: "flush", component: NewCompanyPanel });
  app.composer.customize({ id: "company-intent", scopes: ["new-thread"], banners: [{ id: "company", chrome: "bare", component: ComposeBanner }] });
  app.slots.settingsSection({
    id: "connect",
    title: "Подключение к Manifest",
    description: "Вход по email и паролю для плагина; данные и права — в Manifest.",
    component: ConnectSection,
  });
});
