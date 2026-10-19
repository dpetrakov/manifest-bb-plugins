// Новый чат об организации на экране «New thread» BB (W-20, по приёмке): организация без
// чатов открывается так же, как с чатом — центр BB (здесь его экран нового треда), справа
// карточка в боковой панели. Над полем ввода — баннер «Новый чат: …»; первое сообщение
// создаёт тред, и Manifest привязывает его к организации (сервер плагина сводит отчёт
// баннера с событием BB «тред создан»).
import { useEffect, useRef, useState } from "react";
import { useBbNavigate, useComposer, useRpc, type PluginNewThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../../server";
import { CardView } from "../CardTab";
import { DashboardBody } from "../dashboard/DashboardPage";
import { useOpenCompany } from "./state";
import { ManifestMark } from "../manifest";
import { clearComposeIntent, readComposeIntent, type ComposeIntent } from "./intent";

export const NEW_COMPANY_PANEL = "company-new";
/** Banner of the New thread composer: which organisation the chat will be about. */
export function ComposeBanner() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const composer = useComposer();
  const [intent, setIntent] = useState<ComposeIntent | null>(() => readComposeIntent());
  const opened = useRef(false);
  useEffect(() => {
    if (!intent || opened.current) return;
    opened.current = true;
    const title = intent.kind === "topic" ? "Дашборд аутрича" : intent.title.slice(0, 60) || "Организация";
    navigate.openThreadPanel({ actionId: NEW_COMPANY_PANEL, title, params: { v: 1, kind: intent.kind, id: intent.id } });
  }, [intent, navigate]);
  useEffect(() => {
    if (!intent) return;
    return composer.onSubmitted(() => {
      clearComposeIntent();
      void rpc.call("compose_submitted", { kind: intent.kind, id: intent.id, title: intent.title.slice(0, 200) });
      setIntent(null);
    });
  }, [composer, intent, rpc]);
  if (!intent) return null;
  return (
    <div className="mf-island flex items-center gap-2 px-2 py-1 text-xs">
      <ManifestMark />
      <span className="min-w-0 flex-1 truncate">
        {intent.kind === "topic" ? (
          <>
            Новый чат по <b>дашборду аутрича</b>
          </>
        ) : (
          <>
            Новый чат: <b>{intent.title || "организация"}</b>
          </>
        )}
      </span>
      <button
        type="button"
        aria-label="Не привязывать чат"
        title="Не привязывать чат"
        className="rounded px-1.5 hover:bg-state-hover"
        onClick={() => {
          clearComposeIntent();
          setIntent(null);
        }}
      >
        ×
      </button>
    </div>
  );
}

/** The object of a future chat in the New thread screen's side panel. */
export function NewCompanyPanel({ params }: PluginNewThreadPanelProps) {
  const openCompany = useOpenCompany();
  const p = params && typeof params === "object" && !Array.isArray(params) ? (params as { kind?: unknown; id?: unknown; companyId?: unknown }) : {};
  if (p.kind === "topic") return <DashboardBody topicId={null} onOpenCompany={(id) => openCompany(id)} />;
  const id = typeof p.id === "string" ? p.id : p.companyId;
  if (typeof id !== "string" || !id) return null;
  return <CardView companyId={id} />;
}
