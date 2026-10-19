// Страница плагина «Аутрич» (W-18 — пульт): корень — реестр; /outreach/<companyId> —
// организация на всю ширину («Развернуть» из панели треда): карточка и её чаты с
// «Новый чат». Сами чаты — родные треды BB, карточка в них — справа. Открытие раздела
// включает список поставщиков в сайдбаре.
import { useEffect } from "react";
import { type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { CardView } from "./CardTab";
import { useRegistry, useStatus } from "./hooks";
import { Note, RegistryList } from "./RegistryList";
import { requestSuppliersShow } from "./SuppliersList";
import { ChatsList } from "./workspace/ObjectPanel";

export function OutreachPage({ subPath }: PluginNavPanelProps) {
  const companyId = subPath.split("/")[0] ?? "";
  // Раздел «Аутрич» работает со списком поставщиков слева — плагин включает его сам.
  useEffect(() => {
    requestSuppliersShow();
  }, []);
  if (!companyId) {
    return (
      <div className="@container mf-root flex h-full min-h-0 flex-col">
        <p className="px-4 pt-3 text-sm text-muted-foreground">
          Выберите организацию: откроется её чат с агентом, карточка — справа. Чатов у организации может быть несколько.
        </p>
        <div className="mx-auto mt-2 min-h-0 w-full max-w-3xl flex-1">
          <RegistryList />
        </div>
      </div>
    );
  }
  return <CompanyPage key={companyId} companyId={companyId} />;
}

/** Организация на весь экран: карточка и чаты. */
function CompanyPage({ companyId }: { companyId: string }) {
  const { status } = useStatus();
  const reg = useRegistry();
  useEffect(() => {
    reg.select(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
  if (status && !status.connected) return <Note>{status.message}</Note>;
  return (
    <div className="@container h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-3 @4xl:flex-row">
        <div className="min-w-0 flex-1">
          <CardView companyId={companyId} />
        </div>
        <aside className="flex w-full flex-col gap-2 @4xl:w-96 @4xl:flex-none">
          <h3 className="text-sm font-semibold">Чаты по организации</h3>
          <ChatsList focus={{ kind: "company", id: companyId, title: "" }} />
        </aside>
      </div>
    </div>
  );
}
