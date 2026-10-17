// Страница «Дашборд аутрича» (W-15, docs/outreach/dashboard.md §6): слева —
// плитки, очередь «Сегодня», воронка, регионы, матрица застоя, качество данных и
// лента изменений по фильтру активной темы; справа — чат темы. Темы — треды bb
// в разделе «Аутрич»: переключатель в заголовке, subPath — id треда активной
// темы, subPath "new" — создание темы. Карточка организации открывается во
// вкладке «Карточка» правой панели bb.
import { useCallback, useState } from "react";
import {
  ThreadChat,
  experimental_NewThreadComposer,
  experimental_useAppPanel,
  experimental_useFixedTabTarget,
  useBbNavigate,
  useRpc,
  useSdk,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../server";
import { CardView } from "../CardTab";
import { PANEL_PATH, errorText, useStatus } from "../hooks";
import { formatDateTime } from "../labels";
import { Note } from "../RegistryList";
import { FilterBar } from "./FilterBar";
import { DASHBOARD_PATH, DASH_CARD_TAB, useDashboardData, useSegments, useTopicFilter, useTopics, type Filter } from "./state";
import { Aging, Feed, Funnel, Panel, Quality, QueueView, Regions, Tiles, agingFilter } from "./Widgets";

const NewThreadComposer = experimental_NewThreadComposer;
const NEW = "new";

/** Opens the card of an organisation in the right panel of the dashboard. */
export function useOpenCard() {
  const panel = experimental_useAppPanel();
  const navigate = useBbNavigate();
  return useCallback(
    (companyId: string) => {
      const ok = panel.openFixedTab({ surface: { kind: "current" }, tab: DASH_CARD_TAB, target: { companyId } });
      if (!ok) navigate.toPluginPanel(PANEL_PATH, { subPath: companyId });
    },
    [navigate, panel],
  );
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

function Dashboard({ topicId }: { topicId: string | null }) {
  const { status } = useStatus();
  const navigate = useBbNavigate();
  const openCard = useOpenCard();
  const { filter, setFilter, error: filterError } = useTopicFilter(topicId);
  const data = useDashboardData(filter);
  const { segments, reload: reloadSegments } = useSegments();
  const [chatOpen, setChatOpen] = useState(true);
  const m = data.metrics;
  const statuses = filter.statuses ?? [];

  const pick = (next: Partial<Filter>) => void setFilter({ ...filter, ...next });

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <FilterBar
          filter={filter}
          onChange={(f) => void setFilter(f)}
          segments={segments}
          onSegmentsChanged={reloadSegments}
          canSave={!!status?.canManage}
        />
        {filterError || data.error ? (
          <p role="alert" className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive">
            {filterError ?? data.error}
          </p>
        ) : null}
        {!m ? (
          <Note>{data.loading ? "Считаем…" : "Нет данных"}</Note>
        ) : (
          <>
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>
                Организаций: {m.total} · активных: {m.active}
              </span>
              <span>на {formatDateTime(m.as_of)}</span>
            </div>
            <Tiles metrics={m} active={filter.attention} onPick={(attention) => pick({ attention: attention || undefined })} />
            <div className="grid gap-3 xl:grid-cols-2">
              <Panel title="Очередь «Сегодня»" hint="по порядку важности">
                {data.queue ? <QueueView queue={data.queue} onOpen={openCard} /> : null}
              </Panel>
              <Panel title="Что изменилось" hint={data.seenAt ? `с ${formatDateTime(data.seenAt)}` : "за неделю"}>
                <Feed items={data.feed} seenAt={data.seenAt} onOpen={openCard} />
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
              <Panel title="Застой: статус × давность последнего касания" className="xl:col-span-2">
                <Aging
                  metrics={m}
                  onPick={(st, bucket) => void setFilter({ ...filter, statuses: [st], stale_days: undefined, never_touched: undefined, ...agingFilter(bucket) })}
                />
              </Panel>
              <Panel title="Качество данных и активность" className="xl:col-span-2">
                <Quality metrics={m} onPick={(f) => pick(f as Partial<Filter>)} />
              </Panel>
            </div>
          </>
        )}
      </div>
      <aside className={cn("flex min-h-0 flex-col border-l border-border", chatOpen ? "w-[440px] flex-none" : "w-10 flex-none")}>
        <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
          {chatOpen ? <span className="text-xs font-semibold">Чат темы</span> : null}
          <button
            type="button"
            className="rounded px-1.5 text-xs text-muted-foreground hover:bg-state-hover"
            aria-label={chatOpen ? "Свернуть чат" : "Развернуть чат"}
            onClick={() => setChatOpen(!chatOpen)}
          >
            {chatOpen ? "›" : "‹"}
          </button>
        </div>
        {chatOpen ? (
          topicId ? (
            <div className="min-h-0 flex-1">
              <ThreadChat threadId={topicId} variant="full" layout="contained" />
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-3 text-sm text-muted-foreground">
              <p>
                Темы — отдельные чаты с агентом по дашборду: «Кому напомнить на этой неделе», «Индия», «Качество данных».
                Агент фильтрует дашборд, показывает списки и готовит правки пачками — применяете вы.
              </p>
              <Button size="sm" className="self-start" onClick={() => navigate.toPluginPanel(DASHBOARD_PATH, { subPath: NEW })}>
                Новая тема
              </Button>
            </div>
          )
        ) : null}
      </aside>
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
        navigate.toPluginPanel(DASHBOARD_PATH, { subPath: thread.id, replace: true });
      } catch (e) {
        setError(errorText(e));
      }
    },
    [navigate, rpc, sdk, title],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-end gap-3 px-4 pb-4">
      <h2 className="text-base font-semibold">Новая тема дашборда</h2>
      <p className="text-sm text-muted-foreground">
        Тема — отдельный чат с агентом со своим фильтром дашборда. Попросите, например: «покажи, кому пора напомнить в
        Азии», «какие организации без контактного лица» или «перенеси просроченные шаги на понедельник» — агент подготовит
        пачку, применяете вы.
      </p>
      <Input placeholder="Название темы, например «Напоминания на неделю»" value={title} onChange={(e) => setTitle(e.target.value)} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <NewThreadComposer
        draftKey="manifest-dashboard-topic"
        placeholder="Что сделать в этой теме?"
        onSubmit={(request) => create(request as Parameters<typeof sdk.threads.spawn>[0])}
      />
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

/** Вкладка «Карточка» дашборда: организация из цели вкладки. */
export function DashCardTab(_props: PluginNavPanelProps) {
  const target = experimental_useFixedTabTarget(DASH_CARD_TAB);
  const navigate = useBbNavigate();
  const companyId = target?.target.companyId ?? "";
  if (!companyId) return <Note>Выберите организацию в очереди, ленте или списке чата.</Note>;
  return (
    <CardView
      key={companyId}
      companyId={companyId}
      header={
        <button
          type="button"
          className="mb-2 self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => navigate.toPluginPanel(PANEL_PATH, { subPath: companyId })}
        >
          Открыть чат организации →
        </button>
      }
    />
  );
}
