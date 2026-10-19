// Директивы сообщений агента (W-15, docs/outreach/dashboard.md §6.3–6.4).
//
//   ::manifest-companies{attention="overdue" country="IN" title="…"}
//       — живая таблица организаций по фильтру (атрибуты как у фильтра реестра,
//         списки через запятую) или по ids; «Показать на дашборде», карточка.
//   ::manifest-batch{id="…"}
//       — пачка массовой правки: предпросмотр «было → стало», «Применить» и
//         «Откатить». Нажимает человек: кнопки вызывают Manifest от панели, а
//         агенту применение недоступно (сервер отклоняет его вызов).
//
// Атрибуты — недоверенные строки; всё, что из них берётся, проверяет Manifest.
import { useCallback, useEffect, useRef, useState } from "react";
import { useBbNavigate, useRealtime, useRpc, type PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../server";
import type { Filter } from "../lib/tools";
import { DASHBOARD_PATH, REGISTRY_CHANGED, cleanFilter } from "./dashboard/state";
import { KIND_LABEL, useOpenObjectPanel } from "./workspace/state";
import { errorText, useStatus, useTool } from "./hooks";
import { FIELD_LABEL, STATUS_LABEL, countryName, daysUntil, fieldValue, formatDate, formatDateTime } from "./labels";
import { PriorityBadge } from "./RegistryList";
import type { Batch, ListResult, WorkListItem } from "./types";

/** Many directives in a long topic: reload once after a burst of changes. */
function useDebouncedRealtime(channel: string, handler: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useRealtime(channel, () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(handler, 600 + Math.random() * 600);
  });
}

const LIST_KEYS = new Set(["priorities", "statuses", "tags", "ids"]);
const NUM_KEYS = new Set(["stale_days"]);
const BOOL_KEYS = new Set(["never_touched", "has_phone", "has_email", "has_person"]);
const STR_KEYS = new Set(["q", "region", "country", "owner", "attention", "brand", "segment_id"]);

/** Directive attributes → registry filter (unknown attributes are ignored). */
export function filterFromAttributes(attrs: Readonly<Record<string, string>>): Filter {
  const f: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(attrs)) {
    const v = String(raw).trim().slice(0, 2000);
    if (!v) continue;
    if (LIST_KEYS.has(k)) {
      const items = v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 200);
      f[k] = k === "priorities" ? items.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5) : items;
    } else if (NUM_KEYS.has(k)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) f[k] = Math.floor(n);
    } else if (BOOL_KEYS.has(k)) {
      f[k] = v === "true" || v === "1";
    } else if (STR_KEYS.has(k)) {
      f[k] = v;
    }
  }
  return cleanFilter(f as Filter);
}

function Frame({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div data-bb-plugin="manifest" className="my-2 rounded-lg border border-border bg-card text-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="truncate text-xs font-semibold">{title}</span>
        <span className="flex flex-none gap-1">{actions}</span>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

export function CompaniesDirective({ attributes, message }: PluginMessageDirectiveProps) {
  const tool = useTool();
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const openPanel = useOpenObjectPanel();
  // W-18: an organisation of the list opens on the right of this thread (its focus).
  const openCard = (companyId: string, name: string) => {
    void rpc
      .call("focus_set", { threadId: message.threadId, focus: { kind: "company", id: companyId, title: name.slice(0, 200) } })
      .then(() => openPanel(name || KIND_LABEL.company))
      .catch((e: unknown) => setError(errorText(e)));
  };
  const { status } = useStatus();
  const [res, setRes] = useState<ListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filter = filterFromAttributes(attributes);
  const key = JSON.stringify(filter);
  const title = (attributes.title ?? "").slice(0, 120) || "Организации";

  const load = useCallback(() => {
    if (!status?.connected) return;
    tool<ListResult>("outreach_list_companies", { ...JSON.parse(key), sort: attributes.sort || undefined, limit: 25 }).then(
      (r) => {
        setRes(r);
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [attributes.sort, key, status?.connected, tool]);
  useEffect(load, [load]);
  useDebouncedRealtime(REGISTRY_CHANGED, load);

  // «Показать на дашборде» — только в теме дашборда (у неё есть фильтр).
  const [isTopic, setIsTopic] = useState(false);
  useEffect(() => {
    let alive = true;
    rpc.call("topic_filter_get", { threadId: message.threadId }).then(
      () => alive && setIsTopic(true),
      () => alive && setIsTopic(false),
    );
    return () => {
      alive = false;
    };
  }, [message.threadId, rpc]);

  const show = async () => {
    try {
      await rpc.call("topic_filter_set", { threadId: message.threadId, filter: JSON.parse(key) as Filter });
      navigate.toPluginPanel(DASHBOARD_PATH, { subPath: message.threadId });
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Frame
      title={res ? `${title} · ${res.total}` : title}
      actions={
        isTopic ? (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void show()}>
            Показать на дашборде
          </Button>
        ) : null
      }
    >
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!res ? (
        <p className="text-xs text-muted-foreground">Загружаем…</p>
      ) : res.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Никого по этому фильтру.</p>
      ) : (
        <ul className="flex flex-col">
          {(res.items as WorkListItem[]).map((it) => {
            const na = it.next_action;
            const overdue = na ? daysUntil(na.due_on) < 0 : false;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => openCard(it.id, it.display_name)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-state-hover"
                >
                  <PriorityBadge priority={it.priority} />
                  <span className="min-w-0 flex-1 truncate">{it.display_name}</span>
                  <span className="flex-none text-muted-foreground">{countryName(it.country_code)}</span>
                  <span className="w-28 flex-none truncate text-muted-foreground">{STATUS_LABEL[it.status] ?? it.status}</span>
                  <span className={cn("w-24 flex-none truncate text-right", overdue ? "text-destructive" : "text-muted-foreground")}>
                    {na ? `шаг ${formatDate(na.due_on)}` : it.last_touch_at ? `касание ${formatDate(it.last_touch_at)}` : "без касаний"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {res && res.total > res.items.length ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Показаны {res.items.length} из {res.total}. Полный список — на дашборде.
        </p>
      ) : null}
    </Frame>
  );
}

const STATE_LABEL: Record<Batch["state"], string> = {
  preview: "ждёт подтверждения",
  applying: "применяется…",
  applied: "применена",
  reverted: "откачена",
  expired: "предпросмотр устарел",
};

export function BatchDirective({ attributes }: PluginMessageDirectiveProps) {
  const tool = useTool();
  const { status } = useStatus();
  const id = (attributes.id ?? "").trim().slice(0, 64);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(() => {
    if (!id || !status?.connected) return;
    tool<Batch>("outreach_batch_get", { id }).then(
      (b) => {
        setBatch(b);
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [id, status?.connected, tool]);
  useEffect(load, [load]);
  useDebouncedRealtime(REGISTRY_CHANGED, load);

  const act = async (name: "outreach_batch_apply" | "outreach_batch_revert") => {
    setBusy(true);
    try {
      setBatch(await tool<Batch>(name, { id }));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setConfirmRevert(false);
    }
  };

  if (!id) return <Frame title="Пачка">Нет id пачки.</Frame>;
  if (!batch) return <Frame title="Пачка">{error ?? "Загружаем…"}</Frame>;
  const changing = batch.items.filter((it) => !it.skip);
  const skipped = batch.items.filter((it) => it.skip);
  const shown = expanded ? changing : changing.slice(0, 8);
  const failed = batch.result.filter((r) => !r.ok);
  const canManage = !!status?.canManage;

  return (
    <Frame
      title={`Пачка: ${batch.summary}`}
      actions={<span className="text-[11px] text-muted-foreground">{STATE_LABEL[batch.state]}</span>}
    >
      <p className="text-xs">
        Изменится организаций: <b>{batch.count}</b>
        {batch.skipped ? ` · пропущено: ${batch.skipped}` : ""}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 text-xs">
        {shown.map((it) => (
          <li key={it.company_id} className="rounded bg-muted/40 px-2 py-0.5">
            <span className="font-medium">{it.name}</span>
            {it.changes.map((ch, i) => (
              <span key={i} className="text-muted-foreground">
                {" · "}
                {FIELD_LABEL[ch.field] ?? ch.field}: {fieldValue(ch.field, ch.old)} → {fieldValue(ch.field, ch.new)}
              </span>
            ))}
          </li>
        ))}
      </ul>
      {changing.length > shown.length ? (
        <button type="button" className="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setExpanded(true)}>
          показать все {changing.length}
        </button>
      ) : null}
      {skipped.length > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Пропущены: {skipped.slice(0, 5).map((it) => `${it.name || it.company_id} (${it.skip})`).join("; ")}
          {skipped.length > 5 ? ` и ещё ${skipped.length - 5}` : ""}
        </p>
      ) : null}
      {failed.length > 0 ? (
        <p className="mt-1 text-xs text-destructive">
          Не применилось: {failed.map((r) => `${r.name || r.company_id}: ${r.error}`).join("; ")}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        {batch.state === "preview" && canManage ? (
          <>
            <Button size="sm" className="h-7" disabled={busy || batch.count === 0} onClick={() => void act("outreach_batch_apply")}>
              Применить к {batch.count}
            </Button>
            <span className="text-[11px] text-muted-foreground">до {formatDateTime(batch.expires_at)}</span>
          </>
        ) : null}
        {batch.state === "applied" && canManage ? (
          confirmRevert ? (
            <>
              <Button size="sm" variant="destructive" className="h-7" disabled={busy} onClick={() => void act("outreach_batch_revert")}>
                Откатить пачку
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmRevert(false)}>
                Отмена
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setConfirmRevert(true)}>
              Откатить…
            </Button>
          )
        ) : null}
        {batch.state === "applied" ? (
          <span className="text-[11px] text-muted-foreground">
            применил {batch.applied_by} · {formatDateTime(batch.applied_at)}
          </span>
        ) : null}
      </div>
    </Frame>
  );
}
