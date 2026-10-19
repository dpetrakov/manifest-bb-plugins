// Страница «Дашборд аутрича» (W-15, docs/outreach/dashboard.md §6): слева —
// плитки, очередь «Сегодня», воронка, регионы, матрица застоя, качество данных и
// лента изменений по фильтру активной темы; справа — чат темы. Темы — треды bb
// в разделе «Аутрич»: переключатель в заголовке, subPath — id треда активной
// темы, subPath "new" — создание темы. Карточка организации открывается во
// вкладке «Карточка» правой панели bb.
import { useCallback, useState } from "react";
import {
  experimental_NewThreadComposer,
  useBbNavigate,
  useRpc,
  useSdk,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../server";
import { errorText, useStatus } from "../hooks";
import { formatDateTime } from "../labels";
import { Note } from "../RegistryList";
import { AttentionAccessory } from "./Accessory";
import { FilterBar } from "./FilterBar";
import { useOpenCompany } from "../workspace/state";
import { DASHBOARD_PATH, useDashboardData, useSegments, useTopicFilter, useTopics, type Filter } from "./state";
import { Aging, Feed, Funnel, Panel, Quality, QueueView, Regions, Tiles, agingFilter } from "./Widgets";

const NewThreadComposer = experimental_NewThreadComposer;
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
  if (topicId === NEW) return <NewTopic />;
  return <Dashboard topicId={topicId} />;
}

/**
 * Дашборд на всю ширину (W-18 — пульт): весь реестр или тема. Чат темы — родной тред BB
 * с этим же дашбордом справа («Чат темы»); новые темы — «+ Тема» в шапке страницы.
 */
function Dashboard({ topicId }: { topicId: string | null }) {
  const navigate = useBbNavigate();
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
        <span className="flex-1 text-muted-foreground">
          {topicId
            ? "Дашборд темы. Работа с агентом — в чате темы: дашборд будет справа от него."
            : "Весь реестр. Темы — чаты с агентом по выборке: «Кому напомнить», «Индия», «Качество данных»."}
        </span>
        {topicId ? (
          <Button size="sm" className="h-8" onClick={() => void openTopicChat()}>
            Чат темы
          </Button>
        ) : (
          <Button size="sm" className="h-8" onClick={() => navigate.toPluginPanel(DASHBOARD_PATH, { subPath: NEW })}>
            Новая тема
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
export function DashboardBody({ topicId, onOpenCompany }: { topicId: string | null; onOpenCompany: (companyId: string) => void }) {
  const { status } = useStatus();
  const { filter, setFilter, error: filterError } = useTopicFilter(topicId);
  const data = useDashboardData(filter);
  const { segments, reload: reloadSegments } = useSegments();
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
function NewTopic() {
  const sdk = useSdk();
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (request: Parameters<typeof sdk.threads.spawn>[0]) => {
      try {
        const name = title.trim() || "Тема аутрича";
        const { sectionId } = await rpc.call("section_ensure", null);
        const thread = await sdk.threads.spawn({
          ...request,
          title: name.slice(0, 120),
          pluginMetadata: { kind: "dashboard", filter: {} },
          ...(sectionId ? { sectionId } : {}),
        } as Parameters<typeof sdk.threads.spawn>[0]);
        await rpc.call("topic_add", { threadId: thread.id, title: name.slice(0, 120) });
        // W-18: the topic is a native thread with its dashboard on the right.
        navigate.toThread(thread.id);
      } catch (e) {
        setError(errorText(e));
      }
    },
    [navigate, rpc, sdk, title],
  );

  return (
    <div className="mf-island mf-paper h-full">
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-end gap-3 px-4 pb-4">
      <h2 className="text-base font-bold">Новая тема дашборда</h2>
      <Input placeholder="Название темы, например «Напоминания на неделю»" value={title} onChange={(e) => setTitle(e.target.value)} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <NewThreadComposer
        draftKey="manifest-dashboard-topic"
        placeholder="Что сделать в этой теме?"
        onSubmit={(request) => create(request as Parameters<typeof sdk.threads.spawn>[0])}
      />
    </div>
    </div>
  );
}

/** Переключатель тем в заголовке страницы. */
export function TopicBar({ subPath }: PluginNavPanelProps) {
  const navigate = useBbNavigate();
  const { topics } = useTopics();
  const active = subPath.split("/")[0] || "";
  return (
    <div className="flex max-w-[60vw] items-center gap-1 overflow-x-auto">
      {/* На bb 0.46 рейл без подписей и счётчиков: «ждут + просрочено» — здесь и бейджем вкладки «Поставщики». */}
      <AttentionAccessory />
      <button
        type="button"
        onClick={() => navigate.toPluginPanel(DASHBOARD_PATH, { subPath: "" })}
        aria-pressed={!active}
        className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-xs hover:bg-state-hover", !active && "bg-state-active")}
      >
        Весь реестр
      </button>
      {(topics ?? []).map((t) => (
        <button
          key={t.threadId}
          type="button"
          onClick={() => navigate.toPluginPanel(DASHBOARD_PATH, { subPath: t.threadId })}
          aria-pressed={active === t.threadId}
          title={t.title}
          className={cn(
            "max-w-48 truncate whitespace-nowrap rounded-md px-2 py-0.5 text-xs hover:bg-state-hover",
            active === t.threadId && "bg-state-active",
          )}
        >
          {t.title}
        </button>
      ))}
      <button
        type="button"
        onClick={() => navigate.toPluginPanel(DASHBOARD_PATH, { subPath: NEW })}
        className="whitespace-nowrap rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-state-hover"
      >
        + Тема
      </button>
    </div>
  );
}
