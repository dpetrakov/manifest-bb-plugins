// Подписи словарей реестра (те же значения, что в Manifest: internal/outreach/model.go).

export const STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  to_qualify: "На проверке",
  ready: "Готов к контакту",
  contacted: "Написали",
  replied: "Ответил",
  qualified: "Подходит",
  handed_over: "Передан в закупки",
  rejected: "Не подходит",
  do_not_contact: "Не связываться",
};
export const STATUS_ORDER = Object.keys(STATUS_LABEL);
export const STATUS_NEEDS_REASON = ["rejected", "do_not_contact"];

export const KIND_LABEL: Record<string, string> = {
  brand_subsidiary: "Компания бренда",
  importer: "Импортёр / дистрибьютор",
  dealer: "Дилер",
  service_center: "Сервисный центр",
  unknown: "Не определён",
};

export const REGION_LABEL: Record<string, string> = {
  africa: "Африка",
  asia: "Азия",
  "australia-pacific": "Австралия и Океания",
  europe: "Европа",
  "middle-east": "Ближний Восток",
  "north-central-america": "Сев. и Центр. Америка",
  "south-america": "Южная Америка",
};
export const regionLabel = (r: string) => REGION_LABEL[r] ?? (r || "—");

export const PRIORITY_REASON_LABEL: Record<string, string> = {
  phone_and_email: "есть телефон и email",
  phone_only: "только телефон",
  email_only: "только email",
  website_only: "только сайт",
  brand_domain: "все email на домене бренда",
  no_contacts: "нет каналов связи",
};

export const CONTACT_TYPE_LABEL: Record<string, string> = {
  phone: "Телефон",
  mobile: "Мобильный",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  fax: "Факс",
  email: "Email",
  website: "Сайт",
  other: "Другое",
};
export const CONTACT_TYPES = Object.keys(CONTACT_TYPE_LABEL);

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["ru"], { type: "region" });
  } catch {
    return null;
  }
})();

export function countryName(code: string): string {
  if (!code) return "—";
  if (code === "XK") return "Косово";
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function actorLabel(actor: string): string {
  return actor.startsWith("import:") ? "загрузка источника" : actor;
}

// ---- W-15: work layer and dashboard ----

export const ATTENTION_LABEL: Record<string, string> = {
  waiting_reply: "Ждут нашего ответа",
  overdue: "Просрочено",
  due_today: "На сегодня",
  ready_untouched: "Готовы, не тронуты",
  no_next_action: "Без следующего шага",
};

export const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  phone: "Телефон",
  meeting: "Встреча",
  linkedin: "LinkedIn",
  other: "Другое",
};

export const OUTCOME_LABEL: Record<string, string> = {
  sent: "отправлено",
  no_answer: "не ответили",
  replied: "ответили",
  interested: "интерес",
  terms_received: "прислали условия",
  declined: "отказ",
  territory: "территориальный запрет",
  referral: "переадресовали",
  wrong_contact: "неверный контакт",
  out_of_office: "в отпуске",
  bounced: "не доставлено",
};

export const ACTION_LABEL: Record<string, string> = {
  follow_up: "Напомнить",
  call: "Позвонить",
  send_offer: "Отправить запрос",
  wait_reply: "Ждать ответа",
  recycle: "Вернуться позже",
  other: "Другое",
};

export const REASON_LABEL: Record<string, string> = {
  not_profile: "Не наш профиль",
  territory: "Территориальный запрет",
  no_assortment: "Нет ассортимента",
  no_response: "Не отвечает",
  asked_not_to_contact: "Просили не писать",
  other: "Другое",
  "": "Без причины",
};

export const AGING_LABEL: Record<string, string> = {
  never: "не было",
  d0_7: "≤ 7 дн",
  d8_14: "8–14 дн",
  d15_30: "15–30 дн",
  d30p: "> 30 дн",
};
export const AGING_ORDER = ["never", "d0_7", "d8_14", "d15_30", "d30p"];

export const FIELD_LABEL: Record<string, string> = {
  status: "Статус",
  status_reason: "Причина",
  status_reason_code: "Причина",
  owner: "Ответственный",
  tags: "Метки",
  next_action: "Следующий шаг",
  touch: "Касание",
  done: "Шаг",
  due_on: "Срок шага",
  verification: "Проверка канала",
};

/** Human value of a history / batch field. */
export function fieldValue(field: string, value: string): string {
  if (!value) return "—";
  if (field === "status") return STATUS_LABEL[value] ?? value;
  if (field === "status_reason_code") return REASON_LABEL[value] ?? value;
  return value;
}

/** Days between today (local) and a YYYY-MM-DD date; negative = in the past. */
export function daysUntil(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const due = new Date(y, (m ?? 1) - 1, d ?? 1);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : date;
}

/** «12 из 41», with a percentage only when the base is large enough (≥ 20). */
export function rate(part: number, base: number): string {
  if (base <= 0) return "—";
  return base >= 20 ? `${part} из ${base} · ${Math.round((part / base) * 100)}%` : `${part} из ${base}`;
}
