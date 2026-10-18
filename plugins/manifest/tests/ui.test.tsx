// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { CardTab } from "../ui/CardTab";
import { ConnectSection } from "../ui/ConnectSection";
import { OutreachPage } from "../ui/OutreachPage";
import { DashboardPage } from "../ui/dashboard/DashboardPage";
import { BatchDirective, filterFromAttributes } from "../ui/directives";
import { MailPage } from "../ui/mail/MailPage";
import { CompanyMail } from "../ui/mail/CompanyMail";

const status = (over: Record<string, unknown> = {}) => ({
  connected: true,
  url: "https://m.example",
  email: "op@example.com",
  canView: true,
  canManage: true,
  problem: null,
  message: "",
  ...over,
});

const countries = ["DE", "FR", "IN", "MY", "SG", "KE", "ZA", "US", "BR", "AU", "JP", "CN", "TR"].map((c) => ({ value: c, count: 1 }));
const item = (id: string, name: string, country = "DE") => ({
  id, display_name: name, kind: "importer", region: "europe", country_code: country, countries: [country], status: "new",
  priority: 1, priority_reason: "phone_and_email", priority_manual: false, do_not_contact: false, has_phone: true,
  has_whatsapp: false, has_email: true, has_website: false, persons: 0, comments: 0, updated_at: "2026-10-16T10:00:00Z",
});

const card = (over: Record<string, unknown> = {}) => ({
  company: {
    id: "c1", display_name: "THK Powertools", legal_name: "", kind: "importer", brands: ["STIHL"], region: "asia",
    country_code: "SG", address_raw: "48 Gul Crescent", city: "", map_url: "", status: "new", status_reason: "",
    priority: 1, priority_auto: 1, priority_reason: "phone_and_email", priority_manual: null, tags: [],
    do_not_contact: false, do_not_contact_reason: "", manual_fields: [], updated_at: "2026-10-16T10:00:00Z", ...over,
  },
  countries: [{ id: "x", country_code: "SG", country_title: "Singapore", section_label: "", is_primary: true }],
  contacts: [{ id: "k1", person_id: null, type: "email", value_raw: "sales@thk.example", value_norm: "sales@thk.example", label: "", is_brand_domain: false, origin: "import" }],
  persons: [],
  comments: [],
  changes: [{ id: 1, entity: "company", field: "created", old_value: "", new_value: "THK", actor: "import:stihl", at: "2026-10-16T10:00:00Z" }],
  sources: [],
});

describe("registry (page root)", () => {
  it("lists organisations, searches inside the country filter and opens a company", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const r = renderSlot({ component: OutreachPage }, { subPath: "" }, {
      pluginId: "manifest",
      rpc: {
        status: () => status(),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "outreach_facets") return { result: { regions: [{ value: "europe", count: 2 }], countries } };
          return { result: { items: [item("c1", "Woermann"), item("c2", "THK", "SG")], total: 2, limit: 50, offset: 0 } };
        },
      } as never,
      experimental_openFixedTab: () => true,
    });
    expect(await screen.findByText("Woermann")).toBeTruthy();
    expect(screen.getByText("Найдено: 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Фильтр: Страна" }));
    const search = screen.getByLabelText("Поиск: Страна");
    fireEvent.change(search, { target: { value: "герм" } });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Все страны", "Германия (1)"]);
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(calls.some((c) => c.name === "outreach_list_companies" && c.args.country === "DE")).toBe(true));

    fireEvent.click(screen.getByText("THK"));
    expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toPluginPanel" });
    expect(JSON.stringify(r.inspection.navigateCalls.at(-1))).toContain("c2");
    expect(r.inspection.experimental_fixedTabOpenCalls.length).toBeGreaterThan(0);
  });

  it("shows no data without outreach.view", async () => {
    let listed = false;
    renderSlot({ component: OutreachPage }, { subPath: "" }, {
      rpc: {
        status: () => status({ canView: false, canManage: false }),
        tool: () => {
          listed = true;
          return { result: null };
        },
      } as never,
    });
    expect(await screen.findByText(/Нет доступа к реестру/)).toBeTruthy();
    expect(listed).toBe(false);
  });
});

describe("card tab", () => {
  it("renders the card and changes status only with a reason when required", async () => {
    const writes: Record<string, unknown>[] = [];
    renderSlot({ component: CardTab }, { subPath: "c1" }, {
      rpc: {
        status: () => status(),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          if (name === "outreach_update_company") {
            writes.push(args);
            return { result: card({ status: args.status, status_reason: args.status_reason }) };
          }
          return { result: card() };
        },
      } as never,
    });
    expect(await screen.findByText("THK Powertools")).toBeTruthy();
    expect(screen.getByText("sales@thk.example")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Статус"), { target: { value: "rejected" } });
    const apply = screen.getByRole("button", { name: "Сменить статус" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Причина (обязательно)"), { target: { value: "не продаёт ЗИП" } });
    fireEvent.click(apply);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ id: "c1", status: "rejected", status_reason: "не продаёт ЗИП", expected_updated_at: "2026-10-16T10:00:00Z" });
    expect(await screen.findByText("Причина: не продаёт ЗИП")).toBeTruthy();
  });

  it("is read-only without outreach.manage and refreshes on agent changes", async () => {
    let reads = 0;
    const r = renderSlot({ component: CardTab }, { subPath: "c1" }, {
      rpc: {
        status: () => status({ canManage: false }),
        tool: () => {
          reads++;
          return { result: card() };
        },
      } as never,
    });
    expect(await screen.findByText("THK Powertools")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
    expect(screen.queryByLabelText("Новый комментарий")).toBeNull();
    const before = reads;
    await r.behavior.emitRealtime("manifest-company-changed", { companyId: "c1" });
    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });
});

describe("connect section", () => {
  it("signs in and never echoes the password", async () => {
    let sent: Record<string, unknown> | null = null;
    renderSlot({ component: ConnectSection }, {}, {
      rpc: {
        status: () => status({ connected: false, url: "", email: "", message: "Плагин не подключён" }),
        login: (input: Record<string, unknown>) => {
          sent = input;
          return status();
        },
      } as never,
    });
    expect(await screen.findByText("Плагин не подключён")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("https://manifest.example.com"), { target: { value: "m.example" } });
    fireEvent.change(screen.getByPlaceholderText("name@company.com"), { target: { value: "op@example.com" } });
    const pw = screen.getByLabelText("Пароль для плагина") as HTMLInputElement;
    fireEvent.change(pw, { target: { value: "correct horse battery" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByText("Подключено как op@example.com")).toBeTruthy();
    expect(sent).toMatchObject({ url: "m.example", email: "op@example.com", password: "correct horse battery" });
    expect(pw.value).toBe("");
  });
});

const metrics = {
  as_of: "2026-10-19T07:00:00Z", today: "2026-10-19", total: 41, active: 38,
  checks: { waiting_reply: 2, overdue: 5, due_today: 1, no_next_action: 3, ready_untouched: 12 },
  funnel: [{ status: "new", count: 20, median_days_in_status: 3 }, { status: "contacted", count: 9, median_days_in_status: 5 }],
  dropoff: [{ status: "rejected", reason_code: "territory", count: 3 }],
  regions: [{ region: "asia", total: 30, by_status: { new: 20, contacted: 9, rejected: 1 } }],
  aging: [{ status: "contacted", buckets: { never: 0, d0_7: 2, d8_14: 4, d15_30: 2, d30p: 1 } }],
  quality: { by_priority: { "1": 30, "2": 5, "3": 0, "4": 1, "5": 5 }, brand_only: 4, no_channels: 1, with_person: 7, invalid_contacts: 0, unassigned: 30 },
  activity: { touches_out_7d: 6, touches_in_7d: 2, touched: 9, replied: 3, positive_30d: 1, median_days_to_first: 2, outbound_companies_7d: 5 },
};

describe("dashboard (W-15)", () => {
  it("shows checks, the queue and opens the card; a tile filters the topic", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const filters: unknown[] = [];
    const r = renderSlot({ component: DashboardPage }, { subPath: "th-1" }, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canWork: true }),
        seen_get: () => ({ at: null }),
        seen_set: () => ({ ok: true }),
        topic_filter_get: () => ({ filter: {} }),
        topic_filter_set: ({ filter }: { filter: unknown }) => {
          filters.push(filter);
          return { filter };
        },
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "outreach_metrics") return { result: metrics };
          if (name === "outreach_queue") {
            return { result: { as_of: metrics.as_of, today: metrics.today, groups: [
              { key: "overdue", title: "Просрочено", total: 1, items: [{ ...item("c9", "Dealer X", "IN"), group: "overdue", reason: "Повторное письмо № 1 · просрочено на 3 дня" }] },
            ] } };
          }
          if (name === "outreach_feed") return { result: { items: [], since: metrics.as_of } };
          if (name === "outreach_segments") return { result: { items: [] } };
          return { result: null };
        },
      } as never,
      experimental_openFixedTab: () => true,
    });
    expect(await screen.findByText("Dealer X")).toBeTruthy();
    expect(screen.getByText(/просрочено на 3 дня/)).toBeTruthy();
    expect(screen.getByText("Ждут нашего ответа")).toBeTruthy();
    expect(screen.getByText("3 из 9")).toBeTruthy(); // ответили: без процентов при базе < 20
    fireEvent.click(screen.getByText("Dealer X"));
    expect(JSON.stringify(r.inspection.experimental_fixedTabOpenCalls.at(-1))).toContain("c9");
    fireEvent.click(screen.getByText("Просрочено", { selector: "span.text-xs" }));
    await waitFor(() => expect(filters.at(-1)).toEqual({ attention: "overdue" }));
  });

  it("asks to update Manifest without the work layer", async () => {
    renderSlot({ component: DashboardPage }, { subPath: "" }, { rpc: { status: () => status({ canWork: false }) } as never });
    expect(await screen.findByText(/после обновления Manifest/)).toBeTruthy();
  });
});

describe("directives", () => {
  it("parses untrusted attributes into a filter", () => {
    expect(filterFromAttributes({ attention: "overdue", statuses: "contacted, replied", priorities: "1,9", stale_days: "x", evil: "1", never_touched: "true" }))
      .toEqual({ attention: "overdue", statuses: ["contacted", "replied"], priorities: [1], never_touched: true });
  });

  it("applies a batch only by the button", async () => {
    const calls: string[] = [];
    renderSlot({ component: BatchDirective }, {
      attributes: { id: "b1" }, source: "::manifest-batch{id=\"b1\"}",
      message: { id: "m", threadId: "th", turnId: null, projectId: null }, openWorkspaceFile: null,
    }, {
      rpc: {
        status: () => status({ canWork: true }),
        tool: ({ name }: { name: string }) => {
          calls.push(name);
          const base = { id: "b1", summary: "Статус → «Написали»", count: 2, skipped: 1, created_by: "op@example.com",
            created_at: "", expires_at: "2026-10-19T08:00:00Z", applied_by: "", applied_at: null, reverted_at: null,
            items: [{ company_id: "c1", name: "THK", changes: [{ field: "status", old: "new", new: "contacted" }] },
              { company_id: "c2", name: "ZETA", changes: [], skip: "уже в этом статусе" }], result: [] };
          return { result: name === "outreach_batch_apply" ? { ...base, state: "applied", applied_by: "op@example.com" } : { ...base, state: "preview" } };
        },
      } as never,
    });
    expect(await screen.findByText(/Новый → Написали/)).toBeTruthy();
    expect(calls).toEqual(["outreach_batch_get"]);
    fireEvent.click(screen.getByRole("button", { name: "Применить к 2" }));
    await waitFor(() => expect(calls).toContain("outreach_batch_apply"));
    expect(await screen.findByText("применена")).toBeTruthy();
  });
});

describe("mail (W-16)", () => {
  const tpl = {
    id: "t1", name: "First letter", audience: "potential_supplier", language: "en", kind: "first", current_version: 2,
    subject: "Cooperation with {{company.name}}", body: "Dear {{person.name | \"Sir or Madam\"}}", placeholders: ["company.name"],
    updated_at: "2026-10-18T10:00:00Z", updated_by: "op@example.com", versions: [],
  };
  const preview = { subject: "Cooperation with Example Ltd", text: "Dear Sir or Madam", html: "<p>Dear Sir or Madam</p>", missing: [], unknown: [], to: "", from: "", from_name: "", problems: [], sample: true };

  it("lists templates and opens the editor", async () => {
    const r = renderSlot({ component: MailPage }, { subPath: "templates" }, {
      rpc: {
        status: () => status({ canMail: true }),
        tool: ({ name }: { name: string }) => ({ result: name === "mail_templates" ? { items: [tpl] } : null }),
      } as never,
    });
    expect(await screen.findByText("First letter")).toBeTruthy();
    fireEvent.click(screen.getByText("First letter"));
    expect(JSON.stringify(r.inspection)).toContain("tpl/t1");
  });

  it("saves a template as a new one", async () => {
    const saves: Record<string, unknown>[] = [];
    renderSlot({ component: MailPage }, { subPath: "tpl/t1" }, {
      rpc: {
        status: () => status({ canMail: true }),
        template_thread_get: () => ({ threadId: null }),
        section_ensure: () => ({ sectionId: null }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          if (name === "mail_template_get") return { result: tpl };
          if (name === "mail_fields") return { result: { fields: [{ path: "company.name", title: "Название организации" }], audiences: [], kinds: [] } };
          if (name === "mail_preview") return { result: preview };
          if (name === "mail_template_save") {
            saves.push(args);
            return { result: { ...tpl, id: "t2", name: String(args.name), current_version: 1 } };
          }
          return { result: null };
        },
      } as never,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Сохранить как новый" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].id).toBeUndefined();
    expect(saves[0].name).toBe("First letter (копия)");
  });

  it("shows who writes to an organisation and changes the sender", async () => {
    const sets: Record<string, unknown>[] = [];
    const sender = { id: "s1", legal_entity_id: "e1", address: "evgenii@msg.manifestmail.fyi", display_name: "Evgenii | MSG", registered_at: "2026-10-18T10:00:00Z", register_error: "" };
    renderSlot({ component: () => <CompanyMail companyId="c1" /> }, {}, {
      rpc: {
        status: () => status({ canMail: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          if (name === "mail_company_sender") return { result: { legal_entity: null, sender: null, source: "none", problem: "не задан отправитель" } };
          if (name === "mail_entities") return { result: { items: [{ id: "e1", name: "MSG", senders: [sender] }] } };
          if (name === "mail_company_sender_set") {
            sets.push(args);
            return { result: { legal_entity: { id: "e1", name: "MSG" }, sender, source: "company", problem: "" } };
          }
          return { result: null };
        },
      } as never,
    });
    expect(await screen.findByText(/Отправка невозможна: не задан отправитель/)).toBeTruthy();
    await screen.findByText(/Evgenii \| MSG <evgenii/);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "s1" } });
    await waitFor(() => expect(sets).toEqual([{ company_id: "c1", legal_entity_id: "e1", sender_id: "s1" }]));
    expect(await screen.findByText(/задан для организации/)).toBeTruthy();
  });
});
