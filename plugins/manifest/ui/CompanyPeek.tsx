// Сведения об организации при наведении на строку списка слева (по приёмке W-20; приём —
// карточка сессии в плагине sessions bb-workbench): статус, шаг, касания, последнее письмо и
// два действия — «Карточка рядом» (вкладка панели) и «Чат организации». Сразу видно то, что
// пришло в строке списка; последнее касание и письмо догружаются при показе и кэшируются
// до правки организации. Только для устройств с наведением.
import { useCallback, useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "../lib/portal-scope";
import { errorText, useStatus, useTool } from "./hooks";
import { ACTION_LABEL, CHANNEL_LABEL, OUTCOME_LABEL, STATUS_LABEL, countryName, daysUntil, formatDate, regionLabel } from "./labels";
import { Badge, COMPANY_STATUS_TONE, Status } from "./manifest";
import type { SentLetter } from "./mail/send";
import type { Card, Interaction, WorkListItem } from "./types";

const SHOW_DELAY = 450;
const HIDE_DELAY = 220;

interface Details {
  key: string;
  touch: Interaction | null;
  letter: SentLetter | null;
  sandbox: boolean;
  error: string | null;
}

/** Last touch and letter per organisation, until it changes (updated_at). */
const cache = new Map<string, Details>();

export interface Peek {
  item: WorkListItem;
  box: DOMRect;
}

const canHover = () => typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover)").matches;

/** Hover timing: the card waits a moment; once shown, the next row switches at once. */
export function usePeek() {
  const [peek, setPeek] = useState<Peek | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const enter = useCallback((item: WorkListItem, el: HTMLElement) => {
    if (!canHover()) return;
    clearTimeout(timer.current);
    const box = el.getBoundingClientRect();
    timer.current = setTimeout(() => {
      shown.current = true;
      setPeek({ item, box });
    }, shown.current ? 0 : SHOW_DELAY);
  }, []);
  const leave = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      shown.current = false;
      setPeek(null);
    }, HIDE_DELAY);
  }, []);
  const keep = useCallback(() => clearTimeout(timer.current), []);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    shown.current = false;
    setPeek(null);
  }, []);
  return { peek, enter, leave, keep, close };
}

function useDetails(item: WorkListItem): Details | null {
  const tool = useTool();
  const { status } = useStatus();
  const canMail = !!status?.canMail;
  // The letter is asked only with the mail capability: a cache filled before it was known is stale.
  const key = `${item.id}:${item.updated_at}:${canMail ? "mail" : ""}`;
  const [details, setDetails] = useState<Details | null>(() => {
    const c = cache.get(item.id);
    return c?.key === key ? c : null;
  });
  useEffect(() => {
    const c = cache.get(item.id);
    if (c?.key === key) {
      setDetails(c);
      return;
    }
    setDetails(null);
    let alive = true;
    Promise.all([
      tool<Card>("outreach_get_company", { id: item.id }),
      canMail ? tool<{ items: SentLetter[] }>("mail_messages", { company_id: item.id, limit: 1 }).catch(() => null) : Promise.resolve(null),
    ]).then(
      ([card, mail]) => {
        const d: Details = {
          key,
          touch: card?.interactions?.[0] ?? null,
          letter: mail?.items?.[0] ?? null,
          sandbox: !!card?.sandbox_traces,
          error: null,
        };
        cache.set(item.id, d);
        if (alive) setDetails(d);
      },
      (e: unknown) => alive && setDetails({ key, touch: null, letter: null, sandbox: false, error: errorText(e) }),
    );
    return () => {
      alive = false;
    };
  }, [canMail, item.id, key, tool]);
  return details;
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 gap-2", className)}>
      <span className="w-20 flex-none text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function Step({ item }: { item: WorkListItem }) {
  const step = item.next_action;
  if (!step) {
    const closed = ["rejected", "do_not_contact", "handed_over"].includes(item.status);
    return <span className={closed ? "text-muted-foreground" : "text-[var(--mf-amber)]"}>{closed ? "—" : "не назначен"}</span>;
  }
  const days = step.due_on ? daysUntil(step.due_on) : null;
  const when =
    days === null ? "" : days < 0 ? `просрочено на ${-days} дн` : days === 0 ? "сегодня" : `до ${formatDate(step.due_on)}`;
  return (
    <span>
      {ACTION_LABEL[step.action] ?? step.action}
      {when ? <span className={cn(days !== null && days < 0 && "font-medium text-destructive")}> · {when}</span> : null}
      {step.note ? <span className="block truncate text-muted-foreground">{step.note}</span> : null}
    </span>
  );
}

function Touches({ item }: { item: WorkListItem }) {
  const n = item.touches_count ?? 0;
  if (!n) return <span className="text-muted-foreground">ещё не было</span>;
  const inbound = item.last_inbound_at && (!item.last_outbound_at || item.last_inbound_at > item.last_outbound_at);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {n} · последнее {formatDate(item.last_touch_at)}
      {inbound ? <Badge tone="volt">ответ {formatDate(item.last_inbound_at)}</Badge> : null}
    </span>
  );
}

function Lazy({ item }: { item: WorkListItem }) {
  const d = useDetails(item);
  if (!d) {
    return (
      <div className="flex flex-col gap-1" aria-label="Загружаем…">
        <span className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <span className="h-3 w-3/5 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (d.error) return <p className="text-destructive">Не загрузилось: {d.error}</p>;
  const t = d.touch;
  const l = d.letter;
  return (
    <>
      {t ? (
        <Row label="Касание">
          <span className="flex flex-wrap items-center gap-1">
            {t.direction === "in" ? "←" : "→"} {CHANNEL_LABEL[t.channel] ?? t.channel} · {formatDate(t.occurred_at)}
            {t.outcome ? ` · ${OUTCOME_LABEL[t.outcome] ?? t.outcome}` : ""}
            {t.sandbox ? <Badge tone="sandbox">песочница</Badge> : null}
          </span>
          {t.summary ? <span className="line-clamp-2 text-muted-foreground">{t.summary}</span> : null}
        </Row>
      ) : null}
      {l ? (
        <Row label="Письмо">
          <span className="flex flex-wrap items-center gap-1">
            <Status tone={l.tone}>{l.status_text}</Status>
            <span className="text-muted-foreground">· {formatDate(l.sent_at ?? l.created_at)}</span>
            {l.replies?.length ? <Badge tone="volt">ответ</Badge> : null}
            {l.sandbox ? <Badge tone="sandbox">песочница</Badge> : null}
          </span>
          <span className="block truncate text-muted-foreground">{l.subject}</span>
        </Row>
      ) : null}
      {d.sandbox && !t?.sandbox && !l?.sandbox ? <Row label="Песочница">есть следы теста</Row> : null}
    </>
  );
}

const action =
  "inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";

/** The card beside the hovered row. */
export function CompanyPeek({
  peek,
  onKeep,
  onLeave,
  onClose,
  onBeside,
  onChat,
}: {
  peek: Peek;
  onKeep: () => void;
  onLeave: () => void;
  onClose: () => void;
  onBeside: (it: WorkListItem) => void;
  onChat: (it: WorkListItem) => void;
}) {
  const scope = usePortalScopeProps();
  const { item: it, box } = peek;
  const countries = `${countryName(it.country_code)}${it.countries.length > 1 ? ` +${it.countries.length - 1}` : ""}`;
  return (
    <PopoverPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <PopoverPrimitive.Anchor asChild>
        <span aria-hidden style={{ position: "fixed", left: box.right, top: box.top, width: 1, height: box.height }} />
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          {...scope}
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          role="dialog"
          aria-label={`Организация: ${it.display_name}`}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={onKeep}
          onMouseLeave={onLeave}
          className="z-50 outline-none"
        >
          <div className="mf-island flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-xs shadow-xl">
            <div className="flex items-start gap-1.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="flex-none rounded-full border border-border px-1.5 text-[11px] font-semibold">P{it.priority}</span>
                  <span className="truncate text-sm font-semibold">{it.display_name}</span>
                </span>
              </span>
              <span className="flex flex-none items-center" role="toolbar" aria-label="Действия с организацией">
                <button type="button" className={action} title="Карточка рядом — отдельной вкладкой панели" onClick={() => onBeside(it)}>
                  <Icon name="PanelRight" fallback="Columns2" className="size-3.5" />
                  Рядом
                </button>
                <button type="button" className={action} title="Чат организации" onClick={() => onChat(it)}>
                  <Icon name="MessageSquare" fallback="MessageCircle" className="size-3.5" />
                  Чат
                </button>
                <button type="button" className={action} aria-label="Закрыть" title="Закрыть" onClick={onClose}>
                  ×
                </button>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Badge tone={COMPANY_STATUS_TONE[it.status] ?? "muted"}>{STATUS_LABEL[it.status] ?? it.status}</Badge>
              {it.do_not_contact && it.status !== "do_not_contact" ? <Badge tone="err">не связываться</Badge> : null}
              <span className="text-muted-foreground">
                {countries} · {regionLabel(it.region)}
              </span>
            </div>
            <Row label="Шаг">
              <Step item={it} />
            </Row>
            <Row label="Касания">
              <Touches item={it} />
            </Row>
            {it.owner ? <Row label="Ответств.">{it.owner}</Row> : null}
            {it.tags?.length ? <Row label="Метки">{it.tags.join(", ")}</Row> : null}
            <Lazy item={it} />
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
