import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PartnerProfile, PartnerCapability } from "./types";

const CAPABILITIES: [string, string][] = [
 ['legal', 'Юрлицо и регистрации'], ['own_funding', 'Выкуп за средства партнёра'], ['advance_funding', 'Выкуп на наш аванс'],
 ['vat', 'Работа с НДС'], ['purchasing', 'Выкуп и забор у поставщиков'], ['quality', 'Контроль качества'],
 ['warehouse', 'Склад и консолидация'], ['export', 'Экспорт и документы'], ['freight', 'Международная логистика'],
];
const LEVELS = {unknown: 'Неизвестно', claimed: 'Заявлено компанией', verified: 'Подтверждено', unavailable: 'Не предоставляется'};
const MODES = {unknown: 'Не установлена', principal: 'Покупатель и экспортёр от своего имени', agent: 'Агент', contractor: 'Подрядчик отдельных услуг'};
const emptyProfile = (): PartnerProfile => ({mode: 'unknown', capabilities: {}, notes: ''});
export function PartnerProfileForm({profile, version, canEdit, busy, onSave}: {
 profile?: PartnerProfile; version: string; canEdit: boolean; busy: boolean;
 onSave: (profile: PartnerProfile, version: string) => Promise<unknown>;
}) {
 const [draft, setDraft] = useState<PartnerProfile>(() => profile ?? emptyProfile());
 const [baseVersion, setBaseVersion] = useState(version);
 // Keep the version that belongs to the edit, so a concurrent agent write produces
 // a conflict rather than silently overwriting evidence with an old form.
 const [saved, setSaved] = useState(false);
 useEffect(() => { if (saved && baseVersion !== version) { setDraft(profile ?? emptyProfile()); setBaseVersion(version); setSaved(false); } }, [saved, version, baseVersion, profile]);
 const stale = baseVersion !== version;
 const reset = () => { setDraft(profile ?? emptyProfile()); setBaseVersion(version); };
 const update = (key: string, patch: Partial<PartnerCapability>) => setDraft(d => ({...d, capabilities: {...d.capabilities, [key]: {...(d.capabilities?.[key] ?? {status: 'unknown', notes: '', source_url: ''}), ...patch}}}));
 return <div className="flex flex-col gap-2">
  <p className="text-xs text-muted-foreground">Заявление на сайте не равно проверенному документу. Неизвестное сохраняем явно. Покрытие товарного листа здесь не применяется.</p>
  {stale && <div role="status"><p>Карточка обновилась. Сохранение старой версии будет отклонено.</p><Button onClick={reset}>Загрузить актуальный профиль</Button></div>}
  <label className="flex flex-col gap-1 text-xs">Модель услуг<select className="rounded-md border border-input bg-background px-2 py-1 text-xs min-w-0" disabled={!canEdit || busy} value={draft.mode || 'unknown'} onChange={e => setDraft({...draft, mode: e.target.value as PartnerProfile['mode']})}>{Object.entries(MODES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  {CAPABILITIES.map(([key,label]) => {
   const v = draft.capabilities?.[key] ?? {status: 'unknown', notes: '', source_url: ''};
   return <details key={key} className="border-b border-border py-2 text-xs"><summary>{label} · {LEVELS[v.status] ?? v.status}</summary><div className="flex flex-col gap-2">
    <label className="flex flex-col gap-1 text-xs">Уровень подтверждения<select className="rounded-md border border-input bg-background px-2 py-1 text-xs min-w-0" value={v.status} disabled={!canEdit || busy} onChange={e => update(key, {status: e.target.value as PartnerCapability['status']})}>{Object.entries(LEVELS).map(([s,l]) => <option key={s} value={s}>{l}</option>)}</select></label>
    <label className="flex flex-col gap-1 text-xs">Сведения и проверенные доказательства<textarea className="rounded-md border border-input bg-background px-2 py-1 text-xs min-w-0" rows={3} maxLength={4000} disabled={!canEdit || busy} value={v.notes} onChange={e => update(key, {notes: e.target.value})}/></label>
    <label className="flex flex-col gap-1 text-xs">Источник<input className="rounded-md border border-input bg-background px-2 py-1 text-xs min-w-0" type="url" maxLength={2048} placeholder="https://…" value={v.source_url} disabled={!canEdit || busy} onChange={e => update(key, {source_url: e.target.value})}/></label>
    {v.source_url && <a href={v.source_url} target="_blank" rel="noreferrer">Открыть источник</a>}
   </div></details>;
  })}
  <label className="flex flex-col gap-1 text-xs">Условия, ограничения и следующий вопрос<textarea className="rounded-md border border-input bg-background px-2 py-1 text-xs min-w-0" rows={4} maxLength={16000} disabled={!canEdit || busy} value={draft.notes} onChange={e => setDraft({...draft, notes: e.target.value})}/></label>
  {canEdit && <Button disabled={busy || stale} onClick={async () => { const ok = await onSave(draft, baseVersion); if (ok) setSaved(true); }}>Сохранить профиль партнёра</Button>}
 </div>;
}
