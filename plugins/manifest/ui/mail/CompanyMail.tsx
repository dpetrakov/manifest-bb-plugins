// Блок «Почта» карточки организации (W-16, EP-085): кто ей пишет — юрлицо и адрес
// (свой или по умолчанию) и что мешает отправке. Смена — при outreach.manage.
import { useCallback, useEffect, useState } from "react";
import { errorText, useCompanyChanged, useStatus, useTool } from "../hooks";
import { selectCls, type CompanySender, type LegalEntity } from "./common";

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
        </p>
      ) : null}
      <p className="text-muted-foreground">Отправитель {SOURCE_LABEL[cs.source] ?? cs.source}.</p>
      {cs.problem ? <p className="text-destructive">Отправка невозможна: {cs.problem}</p> : null}
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
    </div>
  );
}
