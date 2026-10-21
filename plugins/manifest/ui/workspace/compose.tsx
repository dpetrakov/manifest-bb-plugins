// Новый чат об объекте на экране «New thread» BB (по приёмке W-20): объект без чатов
// открывается так же, как с чатом — центр BB (здесь его экран нового треда), справа объект
// в боковой панели. Над полем ввода — баннер «Новый чат: …»; первое сообщение создаёт
// тред, и Manifest привязывает его к объекту (сервер плагина сводит отчёт баннера с
// событием BB «тред создан»). Вкладка панели одна и следует за объектом (одинаковые
// params — BB не плодит вкладок); отдельная вкладка — «закреплённый» объект (params.pin).
import { useEffect, useRef, useState } from "react";
import { useBbNavigate, useComposer, useRpc, type PluginNewThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../../server";
import { ManifestMark } from "../manifest";
import { INTENT_EVENT, clearComposeIntent, readComposeIntent, type ComposeIntent } from "./intent";
import { ObjectBody, PinnedObject, pinOf } from "./ObjectPanel";
import { KIND_LABEL, useBesideHost } from "./state";

export const NEW_COMPANY_PANEL = "company-new";

/** The current intent, live: the list may switch it while the screen is open. */
function useIntent(): [ComposeIntent | null, (v: ComposeIntent | null) => void] {
  const [intent, setIntent] = useState<ComposeIntent | null>(() => readComposeIntent());
  useEffect(() => {
    const on = () => setIntent(readComposeIntent());
    window.addEventListener(INTENT_EVENT, on);
    return () => window.removeEventListener(INTENT_EVENT, on);
  }, []);
  return [intent, setIntent];
}

function intentTitle(i: ComposeIntent): string {
  return (i.kind === "topic" || i.kind === "mail" || i.kind === "needs" ? KIND_LABEL[i.kind] : i.title || KIND_LABEL[i.kind]).slice(0, 60);
}

/** Banner of the New thread composer: which object the chat will be about. */
export function ComposeBanner() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const composer = useComposer();
  const [intent, setIntent] = useIntent();
  useBesideHost(null);
  const shown = useRef("");
  useEffect(() => {
    if (!intent) return;
    const key = `${intent.kind}:${intent.id}`;
    if (shown.current === key) return;
    shown.current = key;
    // Same params every time: one tab that follows the object (title updates).
    navigate.openThreadPanel({ actionId: NEW_COMPANY_PANEL, title: intentTitle(intent), params: { v: 1 } });
  }, [intent, navigate]);
  useEffect(() => {
    if (!intent) return;
    return composer.onSubmitted(() => {
      clearComposeIntent();
      void rpc.call("compose_submitted", { kind: intent.kind, id: intent.id, title: intent.title.slice(0, 200) });
      setIntent(null);
    });
  }, [composer, intent, rpc, setIntent]);
  if (!intent) return null;
  const what = intent.kind === "topic" || intent.kind === "mail" || intent.kind === "needs" ? KIND_LABEL[intent.kind].toLowerCase() : intent.title || KIND_LABEL[intent.kind].toLowerCase();
  return (
    <div className="mf-island flex items-center gap-2 px-2 py-1 text-xs">
      <ManifestMark />
      <span className="min-w-0 flex-1 truncate">
        Новый чат: <b>{what}</b>
      </span>
      <button
        type="button"
        aria-label="Не привязывать чат"
        title="Не привязывать чат"
        className="rounded px-1.5 hover:bg-state-hover"
        onClick={() => clearComposeIntent()}
      >
        ×
      </button>
    </div>
  );
}

/** The object of a future chat in the New thread screen's side panel. */
export function NewCompanyPanel({ params }: PluginNewThreadPanelProps) {
  const [intent] = useIntent();
  const pin = pinOf(params);
  if (pin) return <PinnedObject pin={pin} mainTitle={intent ? intentTitle(intent) : null} />;
  if (!intent) return <p className="p-3 text-xs text-muted-foreground">Чат не привязан к объекту Manifest.</p>;
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <ObjectBody key={`${intent.kind}:${intent.id}`} focus={{ kind: intent.kind, id: intent.id, title: intent.title }} />
    </div>
  );
}
