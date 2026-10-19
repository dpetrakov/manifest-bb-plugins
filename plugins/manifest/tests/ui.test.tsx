// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { CardTab } from "../ui/CardTab";
import { ConnectSection } from "../ui/ConnectSection";
import { OutreachPage } from "../ui/OutreachPage";
import { DashboardPage } from "../ui/dashboard/DashboardPage";
import { BatchDirective, filterFromAttributes } from "../ui/directives";
import { DashboardBody } from "../ui/dashboard/DashboardPage";
import { useOpenCompany } from "../ui/workspace/state";
import { Feed } from "../ui/dashboard/Widgets";
import { MailHub, MailPage } from "../ui/mail/MailPage";
import { TemplateEditor } from "../ui/mail/TemplateEditor";
import { CompanyMail } from "../ui/mail/CompanyMail";
import { LetterDirective } from "../ui/mail/LetterView";
import { MailingDirective } from "../ui/mail/MailingView";
import { SUPPLIERS_LIST, switchSuppliersList } from "../ui/SuppliersList";
import { RegistryList } from "../ui/RegistryList";
import { useState } from "react";
import { FocusHeader, ObjectBody, ObjectPanel } from "../ui/workspace/ObjectPanel";
import { LetterChip, MailingChip } from "../ui/workspace/Chips";
import { MailingSendBar } from "../ui/mail/send";

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
        // W-18: THK has no chats yet → its page; Woermann has one → its chat.
        chats_list: ({ id }: { id: string }) => ({ chats: id === "c1" ? [{ threadId: "th-w", title: "Аутрич: Woermann" }] : [] }),
        focus_set: () => ({ focus: { kind: "company", id: "c1", title: "Woermann" }, trail: [] }),
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

    // The rail opened the section: the list is on the left, the centre goes back to a chat.
    expect(r.inspection.navigateCalls[0]).toMatchObject({ method: "toCompose" });
    // No chats yet: BB's New thread screen, the organisation remembered for its panel and banner.
    const before = r.inspection.navigateCalls.length;
    fireEvent.click(screen.getByText("THK"));
    await waitFor(() => expect(r.inspection.navigateCalls.length).toBeGreaterThan(before));
    expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toCompose" });
    expect(window.sessionStorage.getItem("manifest:compose-intent")).toContain("c2");
    fireEvent.click(screen.getByText("Woermann"));
    await waitFor(() => expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toThread", threadId: "th-w" }));
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
    // The dashboard lives on the right of a chat: its body, as the thread panel shows it.
    function Body() {
      const open = useOpenCompany();
      return <DashboardBody topicId="th-1" onOpenCompany={open} />;
    }
    const r = renderSlot({ component: Body }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canWork: true }),
        chats_list: () => ({ chats: [{ threadId: "th-c9", title: "Аутрич: Dealer X" }] }),
        focus_set: () => ({ focus: { kind: "company", id: "c9", title: "Dealer X" }, trail: [] }),
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
    await waitFor(() => expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toThread", threadId: "th-c9" }));
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
    window.sessionStorage.clear();
    const r = renderSlot({ component: () => <MailHub initial="templates" /> }, {}, {
      rpc: {
        status: () => status({ canMail: true }),
        chats_list: () => ({ chats: [] }),
        section_ensure: () => ({ sectionId: null }),
        tool: ({ name }: { name: string }) => ({ result: name === "mail_templates" ? { items: [tpl] } : null }),
      } as never,
    });
    expect(await screen.findByText("First letter")).toBeTruthy();
    // No chat about the template yet: BB's New thread screen with the editor on the right.
    fireEvent.click(screen.getByText("First letter"));
    await waitFor(() => expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toCompose" }));
    expect(window.sessionStorage.getItem("manifest:compose-intent")).toContain('"id":"t1"');
  });

  it("saves a template as a new one", async () => {
    const saves: Record<string, unknown>[] = [];
    renderSlot({ component: () => <TemplateEditor templateId="t1" /> }, {}, {
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
    await waitFor(() => expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("s1"));
    expect(screen.getByTitle(/задан для организации/)).toBeTruthy();
  });

  const letter = (problems: string[] = []) => ({
    draft: { id: "d1", company_id: CID, template_id: "t1", template_version: 2, template_name: "STIHL — first letter", person_id: null,
      contact_id: null, subject: "STIHL parts for {{company.name}}", body: "x", edited: true, updated_at: "2026-10-18T10:00:00Z", updated_by: "op@example.com · агент BB" },
    preview: { ...preview, subject: "STIHL parts for Agro Store", to: "sales@agro.example", from: "evgenii@msg.manifestmail.fyi",
      from_name: "Evgenii | MSG", problems, sample: false },
  });
  const CID = "11111111-2222-3333-4444-555555555555";

  it("shows the letter as it will go out and its problems", async () => {
    renderSlot({ component: LetterDirective }, {
      attributes: { company: CID }, source: `::manifest-letter{company="${CID}"}`,
      message: { id: "m", threadId: "th", turnId: null, projectId: null }, openWorkspaceFile: null,
    }, {
      rpc: {
        status: () => status({ canMail: true }),
        tool: ({ name }: { name: string }) => ({ result: name === "mail_draft_get" ? letter(["не заполнено: person.position"]) : null }),
      } as never,
    });
    expect(await screen.findByText("STIHL parts for Agro Store")).toBeTruthy();
    expect(screen.getByText("Evgenii | MSG <evgenii@msg.manifestmail.fyi>")).toBeTruthy();
    expect(screen.getByText("sales@agro.example")).toBeTruthy();
    expect(screen.getByText(/По шаблону «STIHL — first letter» v2 · изменён/)).toBeTruthy();
    expect(screen.getByText("Не уйдёт: не заполнено: person.position")).toBeTruthy();
    expect(document.querySelector("iframe")?.getAttribute("sandbox")).toBe("");
  });

  it("refuses a directive without a valid organisation", async () => {
    renderSlot({ component: LetterDirective }, {
      attributes: { company: "x\"><script>" }, source: "", message: { id: "m", threadId: "th", turnId: null, projectId: null }, openWorkspaceFile: null,
    }, { rpc: { status: () => status({ canMail: true }), tool: () => ({ result: null }) } as never });
    expect(await screen.findByText(/не указана организация/)).toBeTruthy();
  });

  it("prepares a letter from a template in the card", async () => {
    const calls: string[] = [];
    let created = false;
    renderSlot({ component: () => <CompanyMail companyId={CID} /> }, {}, {
      rpc: {
        status: () => status({ canMail: true }),
        tool: ({ name }: { name: string }) => {
          calls.push(name);
          if (name === "mail_company_sender") return { result: { legal_entity: null, sender: null, source: "default_audience", problem: "" } };
          if (name === "mail_entities") return { result: { items: [] } };
          if (name === "mail_templates") return { result: { items: [tpl] } };
          if (name === "mail_draft_get") {
            if (!created) throw new Error("Manifest: у организации нет черновика письма: создайте его mail_draft_create по шаблону");
            return { result: letter() };
          }
          if (name === "mail_draft_create") {
            created = true;
            return { result: letter() };
          }
          return { result: null };
        },
      } as never,
    });
    // The button shows before the templates arrive and stays inactive until then: a click
    // in that moment is lost (this was the «flaky» failure, not slowness).
    const prepare = (await screen.findByRole("button", { name: "Подготовить письмо" })) as HTMLButtonElement;
    await waitFor(() => expect(prepare.disabled).toBe(false));
    fireEvent.click(prepare);
    expect(await screen.findByText("STIHL parts for Agro Store")).toBeTruthy();
    expect(calls).toContain("mail_draft_create");
    expect(screen.getByText("Готово к отправке: так письмо и уйдёт.")).toBeTruthy();
  });

  it("shows a mailing: counts, reasons, and each recipient's letter", async () => {
    const MID = "99999999-8888-7777-6666-555555555555";
    const rec = (id: string, name: string, ready: boolean, problems: string[] = []) => ({
      company_id: id, company_name: name, country_code: "IN", person_id: null, contact_id: null, to: `${name.toLowerCase()}@x.example`,
      from: "evgenii@msg.manifestmail.fyi", ready, problems,
    });
    let recipients = [rec("a1", "Alpha", true), rec("b2", "Beta", true), rec("g3", "Gamma", false, ["у организации нет рабочего email"])];
    const mailing = () => ({
      id: MID, name: "STIHL — first letter · 18.10", template_id: "t1", template_version: 2, template_name: "STIHL — first letter",
      audience: "potential_supplier", subject: "s", body: "b", edited: false, state: "draft", total: recipients.length,
      ready: recipients.filter((r) => r.ready).length, skipped: recipients.filter((r) => !r.ready).length,
      reasons: recipients.some((r) => !r.ready) ? { "у организации нет рабочего email": 1 } : {}, recipients,
      updated_at: "2026-10-18T10:00:00Z", updated_by: "op@example.com",
    });
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    renderSlot({ component: MailingDirective }, {
      attributes: { id: MID }, source: "", message: { id: "m", threadId: "th", turnId: null, projectId: null }, openWorkspaceFile: null,
    }, {
      rpc: {
        status: () => status({ canMail: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "mail_mailing_get") return { result: mailing() };
          if (name === "mail_mailing_letter") {
            const r = recipients.find((x) => x.company_id === args.company_id) ?? recipients[0];
            return { result: { recipient: r, index: 0, total: recipients.length, preview: { ...preview, subject: `STIHL parts for ${r.company_name}`, to: r.to, problems: r.problems } } };
          }
          if (name === "mail_mailing_remove") {
            recipients = recipients.filter((x) => !(args.company_ids as string[]).includes(x.company_id));
            return { result: mailing() };
          }
          return { result: null };
        },
      } as never,
    });
    expect(await screen.findByText("Уйдёт: 2")).toBeTruthy();
    expect(screen.getByText("Не уйдёт: 1")).toBeTruthy();
    expect(screen.getByText("у организации нет рабочего email — 1")).toBeTruthy();
    expect(await screen.findByText("STIHL parts for Alpha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "→" }));
    expect(await screen.findByText("STIHL parts for Beta")).toBeTruthy();
    fireEvent.click(screen.getByText("Gamma"));
    expect(await screen.findByText("Не уйдёт: у организации нет рабочего email")).toBeTruthy();
    fireEvent.click(screen.getAllByTitle("Убрать из рассылки")[2]);
    await waitFor(() => expect(calls.some((c) => c.name === "mail_mailing_remove")).toBe(true));
    expect(await screen.findByText("Не уйдёт: 0")).toBeTruthy();
    // Delete the whole mailing: two steps, then the tool.
    fireEvent.click(screen.getByRole("button", { name: "Удалить рассылку" }));
    expect(calls.some((c) => c.name === "mail_mailing_discard")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(calls.some((c) => c.name === "mail_mailing_discard" && c.args.id === MID)).toBe(true));
  });
});

describe("suppliers list switch (0.5.0)", () => {
  const fakeSdk = (value: string, plugins: { id: string; enabled: boolean }[] = []) => {
    const state = { value, revision: 1, writes: [] as string[] };
    const sdk = {
      system: {
        uiPreferences: {
          list: async () => ({ preferences: { "sidebar.threadListProvider": { value: state.value, revision: state.revision } } }),
          set: async ({ value: v, expectedRevision }: { value: string; expectedRevision: number }) => {
            if (expectedRevision !== state.revision) throw new Error("stale");
            state.value = v;
            state.revision++;
            state.writes.push(v);
            return {};
          },
        },
      },
      plugins: { list: async () => ({ plugins }) },
    };
    return { sdk: sdk as never, state };
  };

  it("turns the suppliers list on and back to the previous list", async () => {
    window.localStorage.clear();
    const { sdk, state } = fakeSdk("sidebar-tabs/tabs");
    await switchSuppliersList(sdk, "toggle");
    expect(state.value).toBe(SUPPLIERS_LIST);
    await switchSuppliersList(sdk, "on");
    expect(state.writes).toHaveLength(1);
    await switchSuppliersList(sdk, "toggle");
    expect(state.value).toBe("sidebar-tabs/tabs");
  });

  it("never returns to «automatic», which could pick the suppliers again", async () => {
    window.localStorage.clear();
    const withTabs = fakeSdk("__automatic__", [{ id: "sidebar-tabs", enabled: true }]);
    await switchSuppliersList(withTabs.sdk, "on");
    await switchSuppliersList(withTabs.sdk, "off");
    expect(withTabs.state.value).toBe("sidebar-tabs/tabs");
    window.localStorage.clear();
    const bare = fakeSdk("__automatic__");
    await switchSuppliersList(bare.sdk, "on");
    await switchSuppliersList(bare.sdk, "off");
    expect(bare.state.value).toBe("thread-list/thread-list");
  });
});

describe("workspace: object on the right of a thread (W-18)", () => {
  const MID = "99999999-8888-7777-6666-555555555555";
  const mailingSummary = {
    id: MID, name: "STIHL — first letter · 18.10", template_id: null, template_version: null, template_name: "", audience: "", subject: "s", body: "b",
    edited: false, state: "draft", total: 3, ready: 2, skipped: 1, reasons: {}, recipients: [], partial: true, updated_at: "2026-10-19T10:00:00Z", updated_by: "op",
  };

  it("opens the object panel from the thread header once and on a button", async () => {
    const r = renderSlot({ component: FocusHeader }, { threadId: "th1", projectId: "p", isCompactViewport: false }, {
      rpc: {
        status: () => status(),
        focus_get: () => ({ focus: { kind: "company", id: "c1", title: "THK Powertools" }, trail: [] }),
      } as never,
    });
    const button = await screen.findByRole("button", { name: /Открыть справа: Организация THK Powertools/ });
    await waitFor(() => expect(r.inspection.navigateCalls.filter((c) => c.method === "openThreadPanel")).toHaveLength(1));
    fireEvent.click(button);
    const opens = r.inspection.navigateCalls.filter((c) => c.method === "openThreadPanel");
    expect(opens).toHaveLength(2);
    expect(JSON.stringify(opens[1])).toContain('"actionId":"object"');
  });

  it("shows the mailing with breadcrumbs back to the organisation and «Развернуть»", async () => {
    const rpcCalls: { m: string; a: unknown }[] = [];
    const r = renderSlot({ component: ObjectPanel }, { threadId: "th1", params: { v: 1 } }, {
      rpc: {
        status: () => status({ canMail: true }),
        focus_get: () => ({ focus: { kind: "mailing", id: MID, title: "STIHL — first letter" }, trail: [{ kind: "company", id: "c1", title: "THK" }] }),
        focus_back: (a: unknown) => {
          rpcCalls.push({ m: "focus_back", a });
          return { focus: { kind: "company", id: "c1", title: "THK" }, trail: [{ kind: "mailing", id: MID, title: "STIHL — first letter" }] };
        },
        tool: ({ name }: { name: string }) => {
          if (name === "mail_mailing_get") return { result: { ...mailingSummary, recipients: [], partial: false } };
          if (name === "outreach_get_company") return { result: card() };
          if (name === "mail_company_sender") return { result: { legal_entity: null, sender: null, source: "none", problem: "" } };
          if (name === "mail_draft_get") throw new Error("Manifest: у организации нет черновика письма");
          return { result: { items: [] } };
        },
      } as never,
    });
    expect(await screen.findByText("Рассылка")).toBeTruthy();
    expect(await screen.findByText("Уйдёт: 2")).toBeTruthy();
    // Whole screen is the bb panel's own ⤢: no «Развернуть» of ours.
    expect(screen.queryByRole("button", { name: "Развернуть" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "← THK" }));
    await waitFor(() => expect(rpcCalls).toHaveLength(1));
    expect(await screen.findByText("Работа")).toBeTruthy();
    expect(screen.queryByText("THK Powertools")).toBeNull(); // the panel header names it, the card does not repeat it
  });

  it("tells a chat without an object where objects open", async () => {
    renderSlot({ component: ObjectPanel }, { threadId: "th2", params: null }, {
      rpc: { status: () => status(), focus_get: () => ({ focus: null, trail: [] }) } as never,
    });
    expect(await screen.findByText(/не привязан к объекту Manifest/)).toBeTruthy();
  });

  it("turns a mailing directive into a chip that opens it on the right", async () => {
    const calls: { m: string; a: unknown }[] = [];
    let known = false;
    const r = renderSlot({ component: MailingChip }, {
      attributes: { id: MID }, source: "", message: { id: "m", threadId: "th1", turnId: null, projectId: null }, openWorkspaceFile: null,
    }, {
      rpc: {
        status: () => status({ canMail: true }),
        tool: () => ({ result: mailingSummary }),
        focus_get: () => (known ? { focus: { kind: "mailing", id: MID, title: mailingSummary.name }, trail: [] } : { focus: null, trail: [] }),
        focus_set: (a: unknown) => {
          calls.push({ m: "focus_set", a });
          return { focus: { kind: "mailing", id: MID, title: mailingSummary.name }, trail: [] };
        },
      } as never,
    });
    const chip = await screen.findByRole("button", { name: /Рассылка «STIHL — first letter · 18.10»/ });
    expect(screen.getByText("уйдёт 2 из 3 · не уйдёт 1")).toBeTruthy();
    // New to the thread: the agent's chip asks the person first, naming the object.
    fireEvent.click(chip);
    expect(await screen.findByText(/В этом чате агент сможет её менять/)).toBeTruthy();
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));
    await waitFor(() => expect(r.inspection.navigateCalls.some((c) => c.method === "openThreadPanel")).toBe(true));
    expect(calls[0].a).toMatchObject({ threadId: "th1", focus: { kind: "mailing", id: MID } });
    // Already in the thread: opens at once.
    known = true;
    fireEvent.click(chip);
    await waitFor(() => expect(calls).toHaveLength(2));
  });

  it("opens an old mailing link in the mailing's chat, the mailing on the right", async () => {
    const r = renderSlot({ component: MailPage }, { subPath: `mailing/${MID}` }, {
      rpc: {
        status: () => status({ canMail: true }),
        chats_list: ({ kind }: { kind: string }) => ({ chats: kind === "mailing" ? [{ threadId: "th-m", title: "Рассылка: STIHL" }] : [] }),
        focus_set: () => ({ focus: { kind: "mailing", id: MID, title: "" }, trail: [] }),
        tool: () => ({ result: { items: [] } }),
      } as never,
    });
    await waitFor(() => expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toThread", threadId: "th-m" }));
  });

  it("opens an inbound message with a link-to-organisation form", async () => {
    renderSlot({ component: () => <ObjectBody focus={{ kind: "inbound", id: "i1", title: "" }} /> }, {}, {
      rpc: {
        status: () => status({ canMail: true }),
        chats_list: () => ({ chats: [] }),
        tool: ({ name }: { name: string }) =>
          name === "mail_inbound_get"
            ? { result: { id: "i1", received_at: "2026-10-19T10:00:00Z", kind: "reply", from_address: "a@b.example", from_name: "Ahmed", subject: "Re: STIHL", reply_text: "Send the price list", body_text: "", attachments: [], company_id: null, company_name: "", triage: "unlinked" } }
            : { result: { items: [] } },
      } as never,
    });
    expect(await screen.findByText("Send the price list")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Привязать" })).toBeTruthy();
  });
});

describe("sending from chips (W-20)", () => {
  const CID = "11111111-2222-3333-4444-555555555555";
  const MID = "22222222-2222-2222-2222-222222222222";
  const LID = "33333333-3333-3333-3333-333333333333";
  const msg = { id: "m", threadId: "th1", turnId: null, projectId: null };
  const draft = {
    draft: { id: "d1", company_id: CID, template_id: "t1", template_version: 1, template_name: "First", person_id: null, contact_id: null,
      subject: "s", body: "b", edited: false, updated_at: "2026-10-19T10:00:00.123456Z", updated_by: "op" },
    preview: { subject: "STIHL parts for Agro Store", text: "x", html: "<p>x</p>", missing: [], unknown: [], to: "sales@agro.example",
      from: "evgenii@test.manifestmail.fyi", from_name: "Evgenii | MSG", problems: [], sample: false,
      sender: { legal_entity: { name: "Test", sandbox: true } } },
    fingerprint: "fp-letter",
  };
  const sent = {
    id: LID, company_id: CID, company_name: "Agro Store", legal_entity: "Test", sandbox: true, from: "evgenii@test.manifestmail.fyi",
    from_name: "Evgenii | MSG", to: "sales@agro.example", subject: "STIHL parts for Agro Store", text: "x", template: "First",
    mailing_id: null, mailing_name: "", reply_to_inbound_id: null, status: "queued", status_text: "в очереди", tone: "info",
    final: false, cancellable: true, scheduled_at: null, sent_at: null, created_at: "2026-10-19T10:01:00Z", created_by: "op", replies: [],
  };

  it("sends a ready letter only after the confirmation, then shows its live status", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    renderSlot({ component: LetterChip }, { attributes: { company: CID }, source: "", message: msg, openWorkspaceFile: null }, {
      rpc: {
        status: () => status({ canMail: true, canSend: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "mail_draft_get") return { result: draft };
          if (name === "outreach_get_company") return { result: { company: { display_name: "Agro Store" } } };
          if (name === "mail_send") return { result: { ...sent, status: "pending", status_text: "отправляем…" } };
          if (name === "mail_message_get") return { result: sent };
          return { result: null };
        },
      } as never,
    });
    // Inactive until the status arrives (the right to send): wait, then click.
    const send = (await screen.findByRole("button", { name: "Отправить" })) as HTMLButtonElement;
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);
    expect(await screen.findByText("Отправить письмо?")).toBeTruthy();
    expect(screen.getByText("настоящему адресу не уйдёт")).toBeTruthy();
    expect(calls.some((c) => c.name === "mail_send")).toBe(false);
    const confirmSend = screen.getAllByRole("button", { name: "Отправить" }).at(-1)!;
    fireEvent.click(confirmSend);
    await waitFor(() => expect(calls.find((c) => c.name === "mail_send")?.args).toEqual({ company_id: CID, expect_updated_at: "2026-10-19T10:00:00.123456Z", fingerprint: "fp-letter" }));
    expect(await screen.findByText(/в очереди/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeTruthy();
  });

  it("keeps the send button inactive without the right to send", async () => {
    renderSlot({ component: LetterChip }, { attributes: { company: CID }, source: "", message: msg, openWorkspaceFile: null }, {
      rpc: {
        status: () => status({ canMail: true, canSend: false }),
        tool: ({ name }: { name: string }) => ({ result: name === "mail_draft_get" ? draft : { company: { display_name: "Agro Store" } } }),
      } as never,
    });
    const b = (await screen.findByRole("button", { name: "Отправить" })) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    // Until the status arrives the reason is «нет подключения»; then — the missing right.
    await waitFor(() => expect(b.title).toMatch(/outreach.send/));
  });

  it("sends a mailing with the number the person saw", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const m = {
      id: MID, name: "STIHL — first letter", template_id: null, template_version: null, template_name: "", audience: "", subject: "s", body: "b",
      edited: false, state: "draft", total: 3, ready: 2, skipped: 1, reasons: {}, recipients: [], partial: false, updated_at: "2026-10-19T10:00:00Z",
      updated_by: "op", mode: "live" as const, senders: [{ from: "evgenii@msg.manifestmail.fyi", from_name: "Evgenii | MSG", letters: 2 }], progress: null,
      fingerprint: "fp-mailing",
    };
    function Bar() {
      return <MailingSendBar mailing={m} />;
    }
    renderSlot({ component: Bar }, {} as never, {
      rpc: {
        status: () => status({ canMail: true, canSend: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          return { result: { ...m, state: "sending" } };
        },
      } as never,
    });
    const open = await screen.findByRole("button", { name: "Отправить 2" });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    expect(await screen.findByText("Отправить 2 письма?")).toBeTruthy();
    expect(screen.getByText("Evgenii | MSG — 2")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Отправить 2" }));
    await waitFor(() => expect(calls.find((c) => c.name === "mail_mailing_send")?.args).toEqual({ id: MID, expect: 2, fingerprint: "fp-mailing" }));
  });

  it("sends a mailing from its chip in the chat", async () => {
    const calls: string[] = [];
    const m = {
      id: MID, name: "STIHL — first letter", template_id: null, template_version: null, template_name: "", audience: "", subject: "s", body: "b",
      edited: false, state: "draft", total: 2, ready: 2, skipped: 0, reasons: {}, recipients: [], partial: false, updated_at: "2026-10-19T10:00:00Z",
      updated_by: "op", mode: "sandbox", senders: [{ from: "qa@test.manifestmail.fyi", from_name: "QA", letters: 2 }], progress: null,
    };
    renderSlot({ component: MailingChip }, { attributes: { id: MID }, source: "", message: msg, openWorkspaceFile: null }, {
      rpc: {
        status: () => status({ canMail: true, canSend: true }),
        tool: ({ name }: { name: string }) => {
          calls.push(name);
          return { result: m };
        },
      } as never,
    });
    const open = await screen.findByRole("button", { name: "Отправить 2" });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    expect(await screen.findByText("настоящим адресатам не уйдёт")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group")).getByRole("button", { name: "Отправить 2" }));
    await waitFor(() => expect(calls).toContain("mail_mailing_send"));
  });
});

describe("dashboard feed", () => {
  it("shows the top changes and the full list over the dashboard", async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `f${i}`, company_id: `c${i}`, company_name: `Org ${i}`, entity: "company", field: i === 0 ? "mail_sent" : "status",
      old_value: "new", new_value: i === 0 ? "STIHL parts" : "contacted", actor: "op@example.com", at: "2026-10-19T10:00:00Z", batch_id: null,
    }));
    const opened: string[] = [];
    function F() {
      return <Feed items={items as never} seenAt={null} onOpen={(id) => opened.push(id)} />;
    }
    renderSlot({ component: F }, {} as never, { rpc: {} as never });
    expect(await screen.findByText("Org 7")).toBeTruthy();
    expect(screen.queryByText("Org 8")).toBeNull();
    expect(screen.getByText(/письмо: STIHL parts/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Все изменения · 12/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Org 11"));
    expect(opened).toEqual(["c11"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("organisation before a chat", () => {
  it("puts the new chat in the middle and the card on the right, «Развернуть» goes wide", async () => {
    renderSlot({ component: OutreachPage }, { subPath: "c1" }, {
      pluginId: "manifest",
      rpc: {
        status: () => status(),
        chats_list: () => ({ chats: [] }),
        tool: ({ name }: { name: string }) =>
          name === "outreach_get_company"
            ? { result: card() }
            : { result: { items: [], total: 0 } },
      } as never,
    });
    expect(await screen.findByRole("heading", { name: "THK Powertools" })).toBeTruthy();
    expect(await screen.findByText("Чатов пока нет.")).toBeTruthy();
    expect(await screen.findByText("Работа")).toBeTruthy();
    // The card does not repeat the name next to the chat.
    expect(screen.getAllByText("THK Powertools")).toHaveLength(1);
  });
});

describe("dashboard rail", () => {
  it("opens BB's New thread screen with the dashboard on the right when there is no dashboard chat", async () => {
    window.sessionStorage.clear();
    const r = renderSlot({ component: DashboardPage }, { subPath: "" }, {
      pluginId: "manifest",
      rpc: { status: () => status({ canWork: true }), section_ensure: () => ({ sectionId: null }) } as never,
    });
    await waitFor(() => expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toCompose" }));
    expect(window.sessionStorage.getItem("manifest:compose-intent")).toContain('"kind":"topic"');
  });
});

describe("dashboard selection in the list", () => {
  it("shows the dashboard's organisations on the left while its chat is open", async () => {
    const lists: Record<string, unknown>[] = [];
    let shown = 0;
    window.addEventListener("manifest:suppliers-list", (e) => {
      if ((e as CustomEvent).detail === "on") shown++;
    });
    // A dashboard chat (th-sel) and the sidebar list; «Другой чат» moves the window elsewhere.
    function Window() {
      const [thread, setThread] = useState("th-sel");
      return (
        <>
          <button type="button" onClick={() => setThread("th-other")}>Другой чат</button>
          <DashboardBody topicId="th-sel" threadId="th-sel" onOpenCompany={() => undefined} />
          <RegistryList activeThreadId={thread} />
        </>
      );
    }
    const r = renderSlot({ component: Window }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canWork: true }),
        seen_get: () => ({ at: null }),
        seen_set: () => ({ ok: true }),
        topic_filter_get: () => ({ filter: { attention: "overdue", country: "IN" } }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          if (name === "outreach_list_companies") {
            lists.push(args);
            const sel = args.attention === "overdue";
            return { result: { items: [sel ? item("c9", "Dealer X", "IN") : item("c1", "Woermann")], total: 1, limit: 50, offset: 0 } };
          }
          if (name === "outreach_facets") return { result: { regions: [], countries } };
          if (name === "outreach_metrics") return { result: metrics };
          if (name === "outreach_queue") return { result: { as_of: metrics.as_of, today: metrics.today, groups: [] } };
          if (name === "outreach_feed") return { result: { items: [], since: metrics.as_of } };
          if (name === "outreach_segments") return { result: { items: [] } };
          return { result: null };
        },
      } as never,
    });
    const banner = await screen.findByText(/Выборка дашборда/);
    expect(banner.textContent).toContain("Просрочено");
    expect(shown).toBe(1);
    await waitFor(() => expect(lists.at(-1)).toMatchObject({ attention: "overdue", country: "IN" }));
    expect(screen.queryByLabelText("Поиск по реестру")).toBeNull();
    // A click opens the card next to the dashboard; the chat stays.
    fireEvent.click(await screen.findByText("Dealer X"));
    await waitFor(() => expect(r.inspection.navigateCalls.some((c) => c.method === "openThreadPanel")).toBe(true));
    expect(JSON.stringify(r.inspection.navigateCalls.find((c) => c.method === "openThreadPanel"))).toContain('"pin"');
    expect(r.inspection.navigateCalls.some((c) => c.method === "toThread")).toBe(false);
    // Another chat: the list's own filter.
    fireEvent.click(screen.getByText("Другой чат"));
    expect(await screen.findByText("Woermann")).toBeTruthy();
    expect(screen.queryByText(/Выборка дашборда/)).toBeNull();
    expect(lists.at(-1)?.attention).toBeUndefined();
  });

  it("unlinks the list by × until the dashboard filter changes", async () => {
    const lists: Record<string, unknown>[] = [];
    function Window() {
      return (
        <>
          <DashboardBody topicId="th-x" threadId="th-x" onOpenCompany={() => undefined} />
          <RegistryList activeThreadId="th-x" />
        </>
      );
    }
    renderSlot({ component: Window }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canWork: true }),
        seen_get: () => ({ at: null }),
        seen_set: () => ({ ok: true }),
        topic_filter_get: () => ({ filter: { attention: "overdue" } }),
        topic_filter_set: ({ filter }: { filter: unknown }) => ({ filter }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          if (name === "outreach_list_companies") {
            lists.push(args);
            return { result: { items: [item("c1", "Woermann")], total: 1, limit: 50, offset: 0 } };
          }
          if (name === "outreach_facets") return { result: { regions: [], countries } };
          if (name === "outreach_metrics") return { result: metrics };
          if (name === "outreach_queue") return { result: { as_of: metrics.as_of, today: metrics.today, groups: [] } };
          if (name === "outreach_feed") return { result: { items: [], since: metrics.as_of } };
          if (name === "outreach_segments") return { result: { items: [] } };
          return { result: null };
        },
      } as never,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Отвязать от дашборда" }));
    expect(await screen.findByLabelText("Поиск по реестру")).toBeTruthy();
    await waitFor(() => expect(lists.at(-1)?.attention).toBeUndefined());
    // A new pick on the dashboard links the list again.
    fireEvent.click(screen.getByText("Ждут нашего ответа"));
    expect(await screen.findByText(/Выборка дашборда/)).toBeTruthy();
    await waitFor(() => expect(lists.at(-1)).toMatchObject({ attention: "waiting_reply" }));
  });
});

describe("objects beside the chat", () => {
  it("opens an organisation in a separate panel tab on Cmd-click", async () => {
    const r = renderSlot({ component: OutreachPage }, { subPath: "" }, {
      pluginId: "manifest",
      rpc: {
        status: () => status(),
        tool: ({ name }: { name: string }) =>
          name === "outreach_facets" ? { result: { regions: [], countries } } : { result: { items: [item("c2", "THK", "SG")], total: 1, limit: 50, offset: 0 } },
      } as never,
    });
    const row = await screen.findByText("THK");
    fireEvent.click(row, { metaKey: true });
    await waitFor(() => expect(r.inspection.navigateCalls.some((c) => c.method === "openThreadPanel")).toBe(true));
    expect(JSON.stringify(r.inspection.navigateCalls.find((c) => c.method === "openThreadPanel"))).toContain('"pin"');
  });

  it("lists mailings with their state and result", async () => {
    const sending = {
      id: "m1", name: "STIHL — first letter", template_id: null, template_version: null, template_name: "First", audience: "", subject: "s", body: "b",
      edited: false, state: "sending", total: 4, ready: 4, skipped: 0, reasons: {}, recipients: [], partial: false, updated_at: "2026-10-19T10:00:00Z",
      updated_by: "op", mode: "sandbox",
      progress: { letters: 4, in_channel: 1, sent: 3, failed: 0, suppressed: 0, cancelled: 0, replies: 2, auto_replies: 0, unsubscribes: 0, senders: [], estimated_done_at: null, sandbox: true, sent_at: null, sent_by: "op", stopped_at: null, stopped_by: "" },
    };
    renderSlot({ component: () => <MailHub initial="mailings" /> }, {}, {
      rpc: { status: () => status({ canMail: true }), tool: () => ({ result: { items: [sending] } }) } as never,
    });
    expect(await screen.findByText("STIHL — first letter")).toBeTruthy();
    expect(screen.getByText("Идёт")).toBeTruthy();
    expect(screen.getByText("песочница")).toBeTruthy();
    const row = screen.getByText("STIHL — first letter").closest("tr")!;
    expect(within(row).getByText("3")).toBeTruthy(); // ушло
    expect(within(row).getByText("2")).toBeTruthy(); // ответы
  });
});
