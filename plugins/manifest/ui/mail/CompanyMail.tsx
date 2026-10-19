// Блок «Почта» карточки организации (W-16, EP-085): кто ей пишет — юрлицо и адрес
// (свой или по умолчанию) и что мешает отправке. Смена — при outreach.manage.
import { useCallback, useEffect, useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { errorText, useCompanyChanged, useStatus, useTool } from "../hooks";
import { ModeBadge, Status } from "../manifest";
import { MAIL_PATH, selectCls, type CompanySender, type LegalEntity, type Mailing, type Template } from "./common";
import { LetterView, useLetter } from "./LetterView";
import { SendLetterButton, SentLetters } from "./send";

const SOURCE_LABEL: Record<string, string> = {
  company: "задан для организации",
  default_audience: "по умолчанию для аудитории",
  default: "общий по умолчанию",
  none: "не задан",
};

export function CompanyMail({ companyId }: { companyId: string }) {
  const tool = useTool();
  const { status } = useStatus();
  const [cs, setCs] = useState<CompanySender | null>(null);
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = !!status?.canManage;

  const load = useCallback(() => {
    tool<CompanySender>("mail_company_sender", { company_id: companyId }).then(
      (r) => {
        setCs(r);
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [companyId, tool]);
  useEffect(load, [load]);
  useCompanyChanged((id) => {
    if (id === companyId) load();
  });
  useEffect(() => {
    if (canEdit) tool<{ items: LegalEntity[] }>("mail_entities", {}).then((r) => setEntities(r.items), () => undefined);
  }, [canEdit, tool]);

  const change = async (senderId: string) => {
    const s = entities?.flatMap((e) => e.senders).find((x) => x.id === senderId);
    setBusy(true);
    try {
      setCs(
        await tool<CompanySender>("mail_company_sender_set", {
          company_id: companyId,
          legal_entity_id: s?.legal_entity_id ?? "",
          sender_id: s?.id ?? "",
        }),
      );
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!cs) return <p className="text-xs text-muted-foreground">{error ?? "Загружаем…"}</p>;
  return (
    <div className="flex flex-col gap-1 text-xs">
      {cs.sender ? (
        <p>
          <span className="font-medium">{cs.sender.display_name}</span>{" "}
          <span className="text-muted-foreground">&lt;{cs.sender.address}&gt;</span>
          {cs.legal_entity ? <span className="text-muted-foreground"> · {cs.legal_entity.name}</span> : null}
          {/* режим показываем, только если Manifest его прислал: без поля «бой» был бы неправдой */}
          {cs.legal_entity && "sandbox" in cs.legal_entity ? (
            <>
              {" "}
              <ModeBadge sandbox={cs.legal_entity.sandbox} />
            </>
          ) : null}
        </p>
      ) : null}
      <p className="text-muted-foreground">Отправитель {SOURCE_LABEL[cs.source] ?? cs.source}.</p>
      {cs.problem ? <Status tone="error">Отправка невозможна: {cs.problem}</Status> : null}
      {canEdit && entities ? (
        <select
          className={selectCls}
          disabled={busy}
          value={cs.source === "company" ? cs.sender?.id ?? "" : ""}
          onChange={(e) => void change(e.target.value)}
        >
          <option value="">{cs.source === "company" ? "Снять (вернуть умолчание)" : "Как по умолчанию"}</option>
          {entities.flatMap((e) =>
            e.senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name} &lt;{s.address}&gt; · {e.name}
              </option>
            )),
          )}
        </select>
      ) : null}
      {error ? <p className="text-destructive">{error}</p> : null}
      <DraftBlock companyId={companyId} canEdit={canEdit} />
      <SentBlock companyId={companyId} canEdit={canEdit} />
    </div>
  );
}

/** Отправленные письма организации (W-20): статус, ответы, «Ответить». */
function SentBlock({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const tool = useTool();
  const [problem, setProblem] = useState<string | null>(null);
  const reply = async (inboundId: string) => {
    setProblem(null);
    try {
      // The draft of the answer appears above, in «Письмо» (signal «company changed»).
      await tool("mail_reply_draft_create", { inbound_id: inboundId });
    } catch (e) {
      setProblem(errorText(e));
    }
  };
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-[var(--mf-line-200)] pt-2">
      <p className="font-semibold">Отправленные</p>
      {problem ? <p className="text-destructive">{problem}</p> : null}
      <SentLetters companyId={companyId} onReply={canEdit ? (id) => void reply(id) : undefined} />
    </div>
  );
}

/** Черновик письма организации (W-17): «Подготовить письмо» по шаблону и письмо «как уйдёт». */
function DraftBlock({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const tool = useTool();
  const navigate = useBbNavigate();
  const { letter, none, error, setLetter, reload } = useLetter(companyId);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!none || !canEdit) return;
    tool<{ items: Template[] }>("mail_templates", {}).then(
      (r) => {
        setTemplates(r.items);
        setTemplateId((cur) => cur || r.items[0]?.id || "");
      },
      () => setTemplates([]),
    );
  }, [canEdit, none, tool]);

  const run = async (name: string, args: Record<string, unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      const out = await tool<unknown>(name, args);
      if (name === "mail_draft_discard") reload();
      else setLetter(out as Parameters<typeof setLetter>[0]);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-[var(--mf-line-200)] pt-2">
      <p className="font-semibold">Письмо</p>
      {error ? <p className="text-destructive">{error}</p> : null}
      {problem ? <p className="text-destructive">{problem}</p> : null}
      {letter ? (
        <>
          <LetterView letter={letter} compact />
          <SendLetterButton letter={letter} companyId={companyId} onSent={() => reload()} />
          <p className="text-[11px] text-muted-foreground">
            {letter.draft.reply_to_inbound_id ? "Ответ поставщику. " : ""}Правьте через чат с агентом: «сделай короче», «спроси про цепи» — письмо обновится здесь. Отправляет человек кнопкой.
          </p>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setProblem(null);
                  try {
                    const m = await tool<Mailing>("mail_mailing_create", { from_company: companyId });
                    navigate.toPluginPanel(MAIL_PATH, { subPath: `mailing/${m.id}` });
                  } catch (e) {
                    setProblem(errorText(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Разослать и другим
              </Button>
              <span className="flex-1" />
              <Button size="sm" variant="outline" className="h-7 border-destructive/50 text-destructive" disabled={busy} onClick={() => void run("mail_draft_discard", { company_id: companyId })}>
                Удалить черновик
              </Button>
            </div>
          ) : null}
        </>
      ) : none ? (
        canEdit ? (
          templates && templates.length === 0 ? (
            <p className="text-muted-foreground">Шаблонов нет — создайте на странице «Почта аутрича».</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select className={selectCls} value={templateId} disabled={busy || !templates} onChange={(e) => setTemplateId(e.target.value)}>
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.language}
                  </option>
                ))}
              </select>
              <Button size="sm" className="h-7" disabled={busy || !templateId} onClick={() => void run("mail_draft_create", { company_id: companyId, template_id: templateId })}>
                Подготовить письмо
              </Button>
            </div>
          )
        ) : (
          <p className="text-muted-foreground">Черновика нет.</p>
        )
      ) : (
        <p className="text-muted-foreground">Загружаем…</p>
      )}
    </div>
  );
}
