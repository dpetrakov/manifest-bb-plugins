// Страница плагина «Аутрич» (W-18 — пульт): корень — реестр.
// /outreach/<companyId> — организация без открытого чата: как будущий тред — в центре
// поле нового чата (и прежние чаты), справа карточка в ширину панели треда; после
// первого сообщения открывается тред, карточка остаётся справа — без скачка раскладки.
// /outreach/<companyId>/full — «Развернуть» из панели треда: карточка на всю ширину и
// чаты сбоку. Открытие раздела включает список поставщиков в сайдбаре.
import { useEffect, useState } from "react";
import { useBbNavigate, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { useRailReturn } from "./workspace/state";
import { CardView } from "./CardTab";
import { useRegistry, useStatus, useTool } from "./hooks";
import { KindLabel } from "./manifest";
import { Note, RegistryList } from "./RegistryList";
import { requestSuppliersShow } from "./SuppliersList";
import { ChatsList } from "./workspace/ObjectPanel";

export function OutreachPage({ subPath }: PluginNavPanelProps) {
  const companyId = subPath.split("/")[0] ?? "";
  const navigate = useBbNavigate();
  const railReturn = useRailReturn();
  // Раздел «Аутрич» работает со списком поставщиков слева — плагин включает его сам.
  // Без организации страница не нужна: центр возвращается к последнему треду (или к
  // экрану нового треда), список — слева.
  useEffect(() => {
    requestSuppliersShow();
    if (companyId) return;
    void railReturn("outreach").then((r) => {
      if (r === "none") navigate.toCompose();
    });
  }, [companyId, navigate, railReturn]);
  if (!companyId) {
    return (
      <div className="@container mf-root mf-island mf-paper flex h-full min-h-0 flex-col">
        <div className="mf-card mx-auto my-3 min-h-0 w-full max-w-3xl flex-1 overflow-hidden">
          <RegistryList />
        </div>
      </div>
    );
  }
  if (subPath.split("/")[1] === "full") return <CompanyPage key={companyId} companyId={companyId} />;
  return <CompanyStart key={companyId} companyId={companyId} />;
}

/** Организация до чата: новый чат в центре, карточка справа — как в треде. */
function CompanyStart({ companyId }: { companyId: string }) {
  const { status } = useStatus();
  const reg = useRegistry();
  const tool = useTool();
  const [name, setName] = useState("");
  useEffect(() => {
    reg.select(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
  useEffect(() => {
    if (!status?.connected) return;
    tool<{ company?: { display_name?: string } }>("outreach_get_company", { id: companyId }).then(
      (c) => setName(c.company?.display_name ?? ""),
      () => undefined,
    );
  }, [companyId, status?.connected, tool]);
  if (status && !status.connected) return <Note>{status.message}</Note>;
  return (
    <div className="@container mf-island mf-paper h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col @4xl:flex-row">
        <main className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto p-4">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
            <KindLabel>Организация</KindLabel>
            <h2 className="m-0 text-lg font-bold leading-snug">{name || "…"}</h2>
            <ChatsList focus={{ kind: "company", id: companyId, title: name.slice(0, 200) }} />
          </div>
        </main>
        <aside className="min-h-0 border-t border-border @4xl:w-[400px] @4xl:flex-none @4xl:border-l @4xl:border-t-0">
          <CardView companyId={companyId} embedded />
        </aside>
      </div>
    </div>
  );
}

/** Организация на весь экран («Развернуть»): карточка и чаты. */
function CompanyPage({ companyId }: { companyId: string }) {
  const { status } = useStatus();
  const reg = useRegistry();
  useEffect(() => {
    reg.select(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
  if (status && !status.connected) return <Note>{status.message}</Note>;
  return (
    <div className="@container mf-island mf-paper h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-3 @4xl:flex-row">
        <div className="min-w-0 flex-1">
          <CardView companyId={companyId} />
        </div>
        <aside className="mf-card flex w-full flex-col gap-2 self-start p-3 @4xl:w-96 @4xl:flex-none">
          <h3 className="text-[13px] font-bold">Чаты по организации</h3>
          <ChatsList focus={{ kind: "company", id: companyId, title: "" }} />
        </aside>
      </div>
    </div>
  );
}
