// «Дашборд аутрича» (W-15, docs/outreach/dashboard.md §6; по приёмке W-20): дашборд живёт
// справа от чата, как карточка организации, — во вкладке боковой панели треда (ресайз,
// на весь экран — кнопка ⤢ панели BB). Рейл открывает последний чат по дашборду или
// экран нового треда BB с дашбордом справа; у каждого чата свой фильтр. Тело дашборда —
// DashboardBody: плитки, очередь «Сегодня», воронка, регионы, застой, качество данных,
// лента изменений.
import { useCallback, useEffect, useState } from "react";
import { useBbNavigate, useRpc, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import type { rpcContract } from "../../server";
import { useStatus } from "../hooks";
import { formatDateTime } from "../labels";
import { Note } from "../RegistryList";
import { FilterBar, filterLabel } from "./FilterBar";
import { useOpenCompany } from "../workspace/state";
import { railTarget, setComposeIntent } from "../workspace/intent";
import { useDashboardData, useDashboardSelection, useSegments, useTopicFilter, type Filter } from "./state";
import { Aging, Feed, Funnel, Panel, Quality, QueueView, Regions, Tiles, agingFilter } from "./Widgets";

const NEW = "new";

/** Opens an organisation from the dashboard page: its latest chat or its page (W-18). */
export function useOpenCard() {
  return useOpenCompany();
}

export function DashboardPage({ subPath }: PluginNavPanelProps) {
  const { status } = useStatus();
  const topicId = subPath.split("/")[0] || null;
  if (!status) return <Note>Подключаемся к Manifest…</Note>;
  if (!status.connected) return <Note>{status.message}</Note>;
  if (!status.canView) return <Note>Нет доступа к реестру (outreach.view).</Note>;
  if (!status.canWork) {
    return <Note>Дашборд появится после обновления Manifest: на сервере ещё нет слоя работы аутрича (касания, очередь, метрики).</Note>;
  }
  return <DashboardEntry topicId={topicId === NEW ? null : topicId} />;
}

/** A new chat about the dashboard: BB's New thread screen with the dashboard on the right. */
export function useNewDashboardChat() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  return useCallback(async () => {
    setComposeIntent("topic", "", "");
    const { sectionId } = await rpc.call("section_ensure", null).catch(() => ({ sectionId: null }));
    navigate.toCompose({ focusPrompt: true, ...(sectionId ? { placement: { sectionId, pinned: false } } : {}) });
  }, [navigate, rpc]);
}

/**
 * The «Дашборд аутрича» rail (по приёмке W-20): the dashboard lives on the right of a
 * chat, like an organisation's card — the rail opens the last dashboard chat or BB's
 * New thread screen with the dashboard in its side panel. A topic link opens its chat.
 * After «back» (a redirect a moment ago) the dashboard is shown here.
 */
function DashboardEntry({ topicId }: { topicId: string | null }) {
  const navigate = useBbNavigate();
  const newChat = useNewDashboardChat();
  const [stay, setStay] = useState(false);
  useEffect(() => {
    if (topicId) {
      navigate.toThread(topicId);
      return;
    }
    const target = railTarget("dashboard");
    if (target === undefined) setStay(true);
    else if (target) navigate.toThread(target);
    else void newChat();
  }, [navigate, newChat, topicId]);
  if (!stay) return <Note>Открываем дашборд…</Note>;
  return <Dashboard topicId={null} />;
}

/**
 * Дашборд на всю ширину (W-18 — пульт): весь реестр или тема. Чат темы — родной тред BB
 * с этим же дашбордом справа («Чат темы»); новые темы — «+ Тема» в шапке страницы.
 */
function Dashboard({ topicId }: { topicId: string | null }) {
  const navigate = useBbNavigate();
  const newChat = useNewDashboardChat();
  const rpc = useRpc<typeof rpcContract>();
  const openCard = useOpenCard();
  const openTopicChat = async () => {
    if (!topicId) return;
    await rpc.call("focus_get", { threadId: topicId }).catch(() => null);
    navigate.toThread(topicId);
  };
  return (
    <div className="@container mf-root mf-island mf-paper flex h-full min-h-0 flex-col">
      <div className="mf-surface flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="flex-1 text-muted-foreground">Весь реестр</span>
        {topicId ? (
          <Button size="sm" className="h-8" onClick={() => void openTopicChat()}>
            Чат
          </Button>
        ) : (
          <Button size="sm" className="h-8" onClick={() => void newChat()}>
            Новый чат по дашборду
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DashboardBody topicId={topicId} onOpenCompany={openCard} />
      </div>
    </div>
  );
}

/**
 * Тело дашборда темы (W-18): на странице, в панели треда и на телефоне. Раскладка — по
 * ширине самого виджета (@container), а не окна; в узком виде второстепенные блоки
 * свёрнуты.
 */
export function DashboardBody({
  topicId,
  threadId,
  onOpenCompany,
}: {
  topicId: string | null;
  /** The thread the dashboard is shown in: the list follows its filter there. */
  threadId?: string | null;
  onOpenCompany: (companyId: string) => void;
}) {
  const { status } = useStatus();
  const { filter, setFilter, error: filterError } = useTopicFilter(topicId);
  const data = useDashboardData(filter);
  const { segments, reload: reloadSegments } = useSegments();
  useDashboardSelection(threadId ?? "", filter, filterLabel(filter, segments));
  const m = data.metrics;
  const statuses = filter.statuses ?? [];
  const pick = (next: Partial<Filter>) => void setFilter({ ...filter, ...next });

  return (
    <div className="@container mf-island mf-paper flex min-w-0 flex-col gap-3 p-3">
      <FilterBar
        filter={filter}
        onChange={(f) => void setFilter(f)}
        segments={segments}
        onSegmentsChanged={reloadSegments}
        canSave={!!status?.canManage}
      />
      {filterError || data.error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-background px-2 py-1 text-xs text-destructive">
          {filterError ?? data.error}
        </p>
      ) : null}
      {!m ? (
        <Note>{data.loading ? "Считаем…" : "Нет данных"}</Note>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-1 text-xs text-muted-foreground">
            <span>
              Организаций: {m.total} · активных: {m.active}
            </span>
            <span>на {formatDateTime(m.as_of)}</span>
          </div>
          <Tiles metrics={m} active={filter.attention} onPick={(attention) => pick({ attention: attention || undefined })} />
          <div className="grid gap-3 @3xl:grid-cols-2">
            <Panel title="Очередь «Сегодня»" hint="по порядку важности">
              {data.queue ? <QueueView queue={data.queue} onOpen={onOpenCompany} /> : null}
            </Panel>
            <Panel title="Что изменилось" hint={data.seenAt ? `с ${formatDateTime(data.seenAt)}` : "за неделю"}>
              <Feed items={data.feed} seenAt={data.seenAt} onOpen={onOpenCompany} />
            </Panel>
            <Panel title="Воронка">
              <Funnel
                metrics={m}
                active={statuses}
                onPick={(st) => pick({ statuses: statuses.includes(st) ? statuses.filter((x) => x !== st) : [...statuses, st] })}
              />
            </Panel>
            <Panel title="Регионы">
              <Regions metrics={m} active={filter.region ?? ""} onPick={(region) => pick({ region: region || undefined })} />
            </Panel>
            <Panel title="Застой: статус × давность последнего касания" className="@3xl:col-span-2">
              <Aging
                metrics={m}
                onPick={(st, bucket) => void setFilter({ ...filter, statuses: [st], stale_days: undefined, never_touched: undefined, ...agingFilter(bucket) })}
              />
            </Panel>
            <Panel title="Качество данных и активность" className="@3xl:col-span-2">
              <Quality metrics={m} onPick={(f) => pick(f as Partial<Filter>)} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/** Создание темы: название и первое сообщение агенту. */
