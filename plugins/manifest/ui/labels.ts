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
