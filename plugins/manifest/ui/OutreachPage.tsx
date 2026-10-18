// Страница плагина «Аутрич» (navPanel). Корень — реестр; /outreach/<companyId> —
// чат организации в центре, карточка — во вкладке «Карточка» правой панели (она
// получает тот же subPath). Открытие раздела включает список поставщиков в сайдбаре.
import { useCallback, useEffect, useState } from "react";
import {
  ThreadChat,
  experimental_NewThreadComposer,
  experimental_useAppPanel,
  useRpc,
  useSdk,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server";
import { CARD_TAB, errorText, useRegistry, useStatus, useTool } from "./hooks";
import { countryName } from "./labels";
import { Note, RegistryList } from "./RegistryList";
import { requestSuppliersShow } from "./SuppliersList";
import type { Card } from "./types";

// Хост-компонент нового треда; JSX нужен заглавный идентификатор.
const NewThreadComposer = experimental_NewThreadComposer;

export function OutreachPage({ subPath }: PluginNavPanelProps) {
  const companyId = subPath.split("/")[0] ?? "";
  // Раздел «Аутрич» работает со списком поставщиков слева — плагин включает его сам.
  useEffect(() => {
    requestSuppliersShow();
  }, []);
  if (!companyId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p className="px-4 pt-3 text-sm text-muted-foreground">
          Выберите организацию: справа откроется её карточка, здесь — чат с агентом по карточке.
        </p>
        <div className="mx-auto mt-2 min-h-0 w-full max-w-3xl flex-1">
          <RegistryList />
        </div>
      </div>
    );
  }
  return <CompanyChat companyId={companyId} />;
}

function CompanyChat({ companyId }: { companyId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const tool = useTool();
  const { status } = useStatus();
  const reg = useRegistry();
  const panel = experimental_useAppPanel();
  const [threadId, setThreadId] = useState<string | null | undefined>(undefined);
  const [company, setCompany] = useState<{ name: string; country: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reg.select(companyId);
    panel.openFixedTab({ surface: { kind: "current" }, tab: CARD_TAB });
    setThreadId(undefined);
    setError(null);
    rpc.call("chat_get", { companyId }).then((r) => setThreadId(r.threadId), (e: unknown) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!status?.connected || !status.canView) return;
    tool<Card>("outreach_get_company", { id: companyId }).then(
      (c) => setCompany({ name: c.company.display_name, country: c.company.country_code }),
      (e: unknown) => setError(errorText(e)),
    );
  }, [companyId, status?.connected, status?.canView, tool]);

  const create = useCallback(
    async (request: Parameters<typeof sdk.threads.spawn>[0]) => {
      const name = company?.name ?? "организация";
      const thread = await sdk.threads.spawn({
        ...request,
        title: `Аутрич: ${name}`.slice(0, 120),
        pluginMetadata: { companyId, companyName: name },
      } as Parameters<typeof sdk.threads.spawn>[0]);
      await rpc.call("chat_link", { companyId, threadId: thread.id });
      setThreadId(thread.id);
    },
    [company?.name, companyId, rpc, sdk],
  );

  if (status && !status.connected) return <Note>{status.message}</Note>;
  if (error) return <Note>Не удалось открыть: {error}</Note>;
  if (threadId === undefined) return <Note>Открываем чат…</Note>;

  const header = company ? (
    <div className="px-4 pb-2 pt-3 text-sm">
      <div className="font-semibold">{company.name}</div>
      <div className="text-xs text-muted-foreground">
        {countryName(company.country)} · чат с агентом по карточке; карточка — справа
      </div>
    </div>
  ) : null;

  if (threadId) {
    return <ThreadChat threadId={threadId} variant="full" layout="contained" leadingContent={header} />;
  }
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-end gap-3 px-4 pb-4">
      {header}
      <p className="text-sm text-muted-foreground">
        Чата по этой организации ещё нет. Первое сообщение создаст его: агент видит карточку и может менять её
        данные в пределах ваших прав — каждое изменение попадёт в историю с пометкой «агент BB».
      </p>
      <NewThreadComposer
        placeholder="Например: проверь контакты и предложи, с чего начать"
        onSubmit={(request) => create(request as Parameters<typeof sdk.threads.spawn>[0])}
      />
    </div>
  );
}
