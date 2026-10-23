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
import { useBesideHost, useOpenCompany, useOpenPinned } from "../ui/workspace/state";
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
import { NeedSheet, NeedsPage } from "../ui/procurement/NeedSheet";
import { CompanyAssortment } from "../ui/procurement/CompanyAssortment";
import { DraftAttachments } from "../ui/mail/attachments";
import { takeMailTab } from "../ui/mail/hubTabs";

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
    const apply = (await screen.findByRole("button", { name: "Сменить статус" })) as HTMLButtonElement;
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

  it("attaches the procurement sheet to a draft and downloads it (EP-113)", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    let spec: Record<string, unknown> | null = null;
    const current = () => {
      const l = letter();
      const sheet = { scope: "catalog", source: "auto", no_qty: !!spec?.no_qty, filename: "RFQ STIHL - MSG.xlsx", rows: 28, catalog: true,
        source_kind: "stihl_country", country: "DE", available: ["country"] };
      return { ...l, draft: { ...l.draft, attachments: spec ? [spec] : [] }, preview: { ...l.preview, attachments: spec ? [sheet] : [] } };
    };
    const created: string[] = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = () => {
      created.push("blob");
      return "blob:x";
    };
    renderSlot({ component: () => <CompanyMail companyId={CID} /> }, {}, {
      rpc: {
        status: () => status({ canMail: true, canManage: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "mail_company_sender") return { result: { legal_entity: null, sender: null, source: "default_audience", problem: "" } };
          if (name === "mail_entities") return { result: { items: [] } };
          if (name === "mail_draft_get") return { result: current() };
          if (name === "mail_draft_attachments") {
            spec = (args.attachments as Record<string, unknown>[])[0] ?? null;
            return { result: current() };
          }
          if (name === "mail_file") return { result: { filename: "RFQ STIHL - MSG.xlsx", content_type: "application/x", content_base64: "UEs=" } };
          return { result: null };
        },
      } as never,
    });
    const pick = await screen.findByRole("combobox", { name: "Вложение письма" });
    fireEvent.change(pick, { target: { value: "catalog" } });
    await waitFor(() =>
      expect(calls.find((c) => c.name === "mail_draft_attachments")?.args).toMatchObject({ company_id: CID, attachments: [{ kind: "procurement_sheet", scope: "catalog", source: "auto" }] }),
    );
    expect(await screen.findByText(/28 поз\. · что есть в каталоге \(региональный: сайт STIHL Германия\)/)).toBeTruthy();
    // The personal catalog the organisation doesn't have is marked; quantities off.
    expect(screen.getByRole("option", { name: /личный каталог организации — нет/ })).toBeTruthy();
    fireEvent.change(await screen.findByRole("combobox", { name: "Количество" }), { target: { value: "no" } });
    await waitFor(() => expect(calls.filter((c) => c.name === "mail_draft_attachments").at(-1)?.args).toMatchObject({ attachments: [{ no_qty: true }] }));
    expect(await screen.findByText(/28 поз\..*без количества/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Скачать" }));
    await waitFor(() => expect(calls.find((c) => c.name === "mail_file")?.args).toEqual({ company_id: CID, position: 0 }));
    await waitFor(() => expect(created).toHaveLength(1));
    URL.createObjectURL = orig;
  });

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

describe("organisation on hover", () => {
  it("shows the state of an organisation beside its row, with «Рядом» and «Чат»", async () => {
    const mm = window.matchMedia;
    const ro = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    window.matchMedia = ((q: string) => ({ matches: q.includes("hover"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    try {
      const past = new Date(Date.now() - 3 * 86_400_000);
      const due = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;
      const row = {
        ...item("c7", "Agro Tools", "IN"), status: "contacted", owner: "op@example.com", touches_count: 4,
        last_touch_at: "2026-10-14T09:00:00Z", last_outbound_at: "2026-10-12T09:00:00Z", last_inbound_at: "2026-10-14T09:00:00Z",
        next_action: { action: "follow_up", note: "", due_on: due, auto: true }, updated_at: "2026-10-18T10:00:00Z",
      };
      const r = renderSlot({ component: RegistryList }, { activeThreadId: "th-1" } as never, {
        pluginId: "manifest",
        rpc: {
          status: () => status({ canMail: true }),
          chats_list: () => ({ chats: [{ threadId: "th-agro", title: "Аутрич: Agro Tools" }] }),
          focus_set: () => ({ focus: { kind: "company", id: "c7", title: "Agro Tools" }, trail: [] }),
          tool: ({ name }: { name: string }) => {
            if (name === "outreach_facets") return { result: { regions: [], countries } };
            if (name === "outreach_list_companies") return { result: { items: [row], total: 1, limit: 50, offset: 0 } };
            if (name === "outreach_get_company") {
              const t = (id: string, direction: string, outcome: string, at: string, summary: string) =>
                ({ id, channel: "email", direction, kind: "email", outcome, occurred_at: at, summary, ingest: "mail", created_by: "x" });
              return { result: { ...card(), interactions: [
                t("i4", "in", "interested", "2026-10-14T09:00:00Z", "Готовы обсудить"),
                t("i3", "out", "sent", "2026-10-12T09:00:00Z", "Письмо: STIHL parts"),
                t("i2", "out", "sent", "2026-10-08T09:00:00Z", "Письмо: первое"),
                t("i1", "out", "sent", "2026-10-01T09:00:00Z", "Письмо: самое первое"),
              ] } };
            }
            return { result: null };
          },
        } as never,
      });
      fireEvent.mouseEnter(await screen.findByText("Agro Tools"));
      const peek = await screen.findByRole("dialog", { name: "Организация: Agro Tools" });
      expect(within(peek).getByText("Написали")).toBeTruthy();
      expect(within(peek).getByText(/просрочено на 3 дн/)).toBeTruthy();
      expect(within(peek).getByText(/ответ 14\.10/)).toBeTruthy();
      expect(await within(peek).findByText("Готовы обсудить")).toBeTruthy();
      // Three last touches, the rest in the card; no separate «Письмо» block.
      expect(within(peek).getByText("Письмо: STIHL parts")).toBeTruthy();
      expect(within(peek).queryByText("Письмо: самое первое")).toBeNull();
      expect(within(peek).getByText("и ещё 1 — в карточке")).toBeTruthy();
      expect(within(peek).getByText(/интерес/)).toBeTruthy();
      fireEvent.click(within(peek).getByRole("button", { name: /Рядом/ }));
      // Its own panel action: BB reuses an action's tab, the dashboard's tab stays.
      await waitFor(() => expect(r.inspection.navigateCalls.find((c) => c.method === "openThreadPanel")).toMatchObject({ options: { actionId: "object-beside" } }));
      fireEvent.mouseEnter(screen.getByText("Agro Tools"));
      fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Чат/ }));
      await waitFor(() => expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toThread", threadId: "th-agro" }));
    } finally {
      window.matchMedia = mm;
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ro;
    }
  });
});

describe("«рядом» from the sidebar", () => {
  it("asks the open thread's header to open the tab: the sidebar has no side panel", async () => {
    // The sidebar's own opener is declined by BB; the thread header (th-1) opens the tab.
    let fromHost = false;
    function Host({ threadId }: { threadId: string | null }) {
      useBesideHost(threadId);
      return null;
    }
    function List() {
      const pin = useOpenPinned();
      return (
        <>
          <Host threadId="th-other" />
          <Host threadId="th-1" />
          <button type="button" onClick={() => (fromHost = pin({ kind: "company", id: "c7", title: "Agro" }, "th-1"))}>Рядом</button>
        </>
      );
    }
    const r = renderSlot({ component: List }, {} as never, { pluginId: "manifest", rpc: {} as never, openThreadPanel: () => true });
    fireEvent.click(screen.getByText("Рядом"));
    expect(fromHost).toBe(true);
    const opens = r.inspection.navigateCalls.filter((c) => c.method === "openThreadPanel");
    expect(opens).toHaveLength(1);
    expect(opens[0]).toMatchObject({ options: { actionId: "object-beside" } });
  });
});

describe("the «рядом» tab", () => {
  it("says the chat is about the main object and makes the card the main one", async () => {
    const r = renderSlot({ component: ObjectPanel }, { threadId: "th-dash", params: { v: 1, pin: { kind: "company", id: "c7", title: "Agro Tools" } } } as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canWork: true }),
        focus_get: () => ({ focus: { kind: "topic", id: "", title: "" }, trail: [] }),
        chats_list: () => ({ chats: [{ threadId: "th-agro", title: "Аутрич: Agro Tools" }] }),
        focus_set: () => ({ focus: { kind: "company", id: "c7", title: "Agro Tools" }, trail: [] }),
        tool: ({ name }: { name: string }) => (name === "outreach_get_company" ? { result: card() } : { result: null }),
      } as never,
    });
    expect(await screen.findByText(/о «Дашборд аутрича»/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Сделать основной/ }));
    await waitFor(() => expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toThread", threadId: "th-agro" }));
  });
});

describe("«Почта аутрича» hub", () => {
  it("the rail opens the hub's chat, not the last mailing's", async () => {
    window.sessionStorage.clear();
    // A mailing's chat remembered by an older build must not win.
    window.sessionStorage.setItem("manifest:last-mail-thread", "th-mailing");
    const asked: unknown[] = [];
    const r = renderSlot({ component: MailPage }, { subPath: "" }, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canMail: true }),
        chats_list: (a: unknown) => {
          asked.push(a);
          return { chats: [{ threadId: "th-hub", title: "Почта аутрича" }] };
        },
        focus_set: () => ({ focus: { kind: "mail", id: "hub", title: "Почта аутрича" }, trail: [] }),
      } as never,
    });
    await waitFor(() => expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toThread", threadId: "th-hub" }));
    expect(asked[0]).toEqual({ kind: "mail", id: "hub" });
  });

  it("a mailing's panel leads back to the hub", async () => {
    const r = renderSlot({ component: ObjectPanel }, { threadId: "th-m", params: null } as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canMail: true }),
        focus_get: () => ({ focus: { kind: "mailing", id: "m1", title: "STIHL — first letter" }, trail: [] }),
        chats_list: ({ kind }: { kind: string }) => ({ chats: kind === "mail" ? [{ threadId: "th-hub", title: "Почта аутрича" }] : [] }),
        focus_set: () => ({ focus: { kind: "mail", id: "hub", title: "Почта аутрича" }, trail: [] }),
        tool: () => ({ result: null }),
      } as never,
    });
    // «Back» names the list the mailing belongs to and opens the hub on it.
    fireEvent.click(await screen.findByRole("button", { name: "← Рассылки" }));
    await waitFor(() => expect(r.inspection.navigateCalls.at(-1)).toMatchObject({ method: "toThread", threadId: "th-hub" }));
    expect(takeMailTab()).toBe("mailings");
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
    // A narrow panel repeats the state under the name (container queries are not evaluated here).
    expect(screen.getAllByText("Идёт").length).toBeGreaterThan(0);
    expect(screen.getByText("песочница")).toBeTruthy();
    const row = screen.getByText("STIHL — first letter").closest("tr")!;
    expect(within(row).getByText("3")).toBeTruthy(); // ушло
    expect(within(row).getByText("2")).toBeTruthy(); // ответы
  });
});

describe("procurement sheet (ADR-051, W-19)", () => {
  const need = (over: Record<string, unknown> = {}) => ({
    id: "n1", public_id: "p1", position_no: 1, status: "draft", brand: "STIHL", part_no: "MA040115814",
    description_en: "STIHL MSA 60 C-B set (with battery and charger)", unit: "pcs", commercial_terms: "", specification_en: "",
    internal_comment: "", target_qty: 10, current_revision_no: 0, response_deadline: null,
    coverage: { ordered_qty: 0, planned_qty: 0, remaining_qty: 10, status: "open" },
    model_key: "MSA 60 C-B", kit: true, category: "Цепная пила", article_aliases: ["MA040115814", "MA040115815"],
    ref_price: 217931.03, ref_currency: "KZT", ...over,
  });

  it("lists positions, imports a file with the preview's fingerprint, edits and cancels", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    renderSlot({ component: NeedSheet }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canProcurement: true, canProcurementManage: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "procurement_needs") return { result: { items: [need()], total: 1 } };
          if (name === "procurement_import_preview") {
            return { result: { rows: 2, fingerprint: "fp1", counts: { create: 1, same: 1 }, actions: [
              { kind: "create", key: "AK 30 S", kit: false, name: "AK 30 S", category: "Аккумулятор", articles: ["45204006545"], qty: 50, ref_price: null, ref_currency: "", lines: [2] },
              { kind: "same", key: "MSA 60 C-B", kit: true, name: "MSA 60", category: "", articles: [], qty: 10, ref_price: null, ref_currency: "", lines: [3] },
            ] } };
          }
          return { result: need() };
        },
      } as never,
    });
    expect(await screen.findByText("MSA 60 C-B")).toBeTruthy();
    expect(screen.getByText("набор")).toBeTruthy();
    // Import: preview, then apply with the same fingerprint.
    const file = new File(["name,qty\nAK 30 S,50\n"], "need.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Файл с позициями"), { target: { files: [file] } });
    const apply = await screen.findByRole("button", { name: /Применить: новых 1/ });
    expect(screen.getByText(/новая: 1/)).toBeTruthy();
    fireEvent.click(apply);
    await waitFor(() => expect(calls.find((c) => c.name === "procurement_import_apply")?.args).toMatchObject({ filename: "need.csv", fingerprint: "fp1" }));
    expect(await screen.findByText(/Загружено: новых 1/)).toBeTruthy();
    // Edit: the matching fields go with the save.
    fireEvent.click(screen.getByText("MSA 60 C-B"));
    const qty = await screen.findByDisplayValue("10");
    fireEvent.change(qty, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(calls.find((c) => c.name === "procurement_need_save")?.args).toMatchObject({
        id: "n1", target_qty: 12, model_key: "MSA 60 C-B", kit: true, article_aliases: ["MA040115814", "MA040115815"], ref_price: 217931.03, ref_currency: "KZT",
      }),
    );
    // Cancel asks first.
    fireEvent.click(screen.getByRole("button", { name: "Отменить позицию" }));
    const confirm = await screen.findAllByRole("button", { name: "Отменить позицию" });
    fireEvent.click(confirm[confirm.length - 1]);
    await waitFor(() => expect(calls.some((c) => c.name === "procurement_need_cancel" && c.args.id === "n1")).toBe(true));
  });

  it("is read-only without procurement.manage", async () => {
    renderSlot({ component: NeedSheet }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canProcurement: true, canProcurementManage: false }),
        tool: () => ({ result: { items: [need()], total: 1 } }),
      } as never,
    });
    expect(await screen.findByText("MSA 60 C-B")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Загрузить файл" })).toBeNull();
    fireEvent.click(screen.getByText("MSA 60 C-B"));
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
  });
});

describe("organisation roles (ADR-051)", () => {
  it("makes a candidate a supplier from its card", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    renderSlot({ component: CardTab }, { subPath: "c1" }, {
      pluginId: "manifest",
      rpc: {
        status: () => status(),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          return { result: card({ roles: ["potential_supplier"], supplier_currency: "INR", supplier_active: true }) };
        },
      } as never,
    });
    const box = await screen.findByRole("checkbox", { name: "Поставщик" });
    fireEvent.click(box);
    await waitFor(() =>
      expect(calls.find((c) => c.name === "outreach_update_company")?.args).toMatchObject({ id: "c1", roles: ["potential_supplier", "supplier"] }),
    );
  });

  it("filters the list by role", async () => {
    const calls: Record<string, unknown>[] = [];
    renderSlot({ component: RegistryList }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status(),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          if (name === "outreach_list_companies") calls.push(args);
          if (name === "outreach_facets") return { result: { regions: [], countries } };
          return { result: { items: [{ ...item("c1", "Woermann"), roles: ["potential_supplier", "supplier"] }], total: 1, limit: 50, offset: 0 } };
        },
      } as never,
    });
    expect(await screen.findByText("поставщик")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Фильтр: Роль" }));
    fireEvent.click(await screen.findByRole("option", { name: /^Поставщик$/ }));
    await waitFor(() => expect(calls.at(-1)?.role).toBe("supplier"));
  });
});

describe("organisation's own assortment (EP-112)", () => {
  it("shows a draft in the rating and sends the decision to «Источники»", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const snap = { id: "d1", status: "applied", products: 40, models: 12, applied_at: "2026-10-22T10:00:00Z", finished_at: "2026-10-22T10:00:00Z", confirmed_at: null, created_by: "op@example.com · агент BB" };
    renderSlot({ component: () => <CompanyAssortment companyId="k1" canEdit website="https://kazgarden.example" /> }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canAssortment: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "assortment_company") {
            return { result: { sources: [{ id: "s1", kind: "distributor_site", base_url: "https://kazgarden.example/stihl", current: snap, latest: snap }], coverage: { by_volume: 64.2, by_positions: 40, unchecked: 2 }, by: "distributor_site", draft: true, country: "KZ" } };
          }
          if (name === "assortment_preview") {
            return { result: { snapshot: snap, source_id: "s1", kind: "distributor_site", origin: "https://kazgarden.example/stihl", recognized: 9, coverage: { by_volume: 64.2, by_positions: 40, unchecked: 2 }, current: null, current_by: "", unknown: ["Масло для цепи"] } };
          }
          return { result: {} };
        },
      } as never,
    });
    expect(await screen.findByText(/по источнику: сайт организации/)).toBeTruthy();
    const draft = await screen.findByRole("group", { name: "Черновик ассортимента" });
    expect(within(draft).getByText(/распознано для листа 9/)).toBeTruthy();
    expect(within(draft).getByText(/Уже в рейтинге организации/)).toBeTruthy();
    expect(within(draft).getByText(/без него — нет данных/)).toBeTruthy();
    expect(screen.getByText(/сайте kazgarden.example/)).toBeTruthy();
    expect(within(draft).queryByRole("button", { name: "Подтвердить" })).toBeNull();
    let asked: string | null = null;
    const on = (e: Event) => {
      asked = (e as CustomEvent<string>).detail;
      e.preventDefault();
    };
    window.addEventListener("manifest:open-source", on);
    fireEvent.click(within(draft).getByRole("button", { name: "Проверить в источниках" }));
    window.removeEventListener("manifest:open-source", on);
    expect(asked).toBe("s1");
  });
});

describe("assortment of countries (EP-107)", () => {
  it("loads a country, applies a ready snapshot and shows the country's items", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const snap = (over: Record<string, unknown>) => ({
      id: "s1", status: "ready", pages_total: 30, pages_done: 30, pages_failed: 0, products: 30, variants: 43, models: 30,
      error: "", started_at: "2026-10-21T10:00:00Z", finished_at: "2026-10-21T10:01:00Z", applied_at: null, ...over,
    });
    renderSlot({ component: NeedSheet }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canProcurement: true, canProcurementManage: true, canAssortment: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "procurement_needs") return { result: { items: [], total: 0 } };
          if (name === "assortment_sources") {
            return { result: { items: [
              { id: "in", kind: "stihl_country", country_code: "IN", title: "STIHL IN", base_url: "", current: null, latest: snap({}) },
              { id: "za", kind: "stihl_country", country_code: "ZA", title: "STIHL ZA", base_url: "", current: snap({ id: "z1", status: "applied", applied_at: "2026-10-20T10:00:00Z", models: 61 }), latest: snap({ id: "z1", status: "applied", models: 61 }) },
              { id: "o1", kind: "distributor_site", country_code: "ID", title: "Сайт · Indokita", base_url: "https://indokita.co.id", company_id: "c9", current: snap({ id: "o1s", status: "applied", products: 15, confirmed_at: null }), latest: snap({ id: "o1s", status: "applied" }) },
            ] } };
          }
          if (name === "assortment_items") {
            return { result: { items: [{ global_id: "164117", product_name: "MSA 60", variant_name: "MSA 60 C-B with AK 20 and AL 101", sku: "MA040115804", model_key: "MSA 60 C-B", kit: true, price: 5196, currency: "ZAR", url: "https://x", category: "Цепная пила" }] } };
          }
          return { result: snap({ status: "running" }) };
        },
      } as never,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Источники" }));
    expect(await screen.findByText(/готов новый снимок: 30 моделей/)).toBeTruthy();
    expect(screen.getByText("нет данных")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    await waitFor(() => expect(calls.find((c) => c.name === "assortment_apply")?.args).toEqual({ id: "s1" }));
    fireEvent.click(screen.getByRole("button", { name: "Обновить" }));
    await waitFor(() => expect(calls.find((c) => c.name === "assortment_refresh")?.args).toEqual({ country: "ZA" }));
    fireEvent.click(screen.getByText("Южно-Африканская Республика"));
    expect(await screen.findByText("MSA 60 C-B")).toBeTruthy();
    expect(screen.getByText("5 196 ZAR")).toBeTruthy();
    expect(screen.getByText("Цепная пила")).toBeTruthy();
    expect(screen.getByText("Модель")).toBeTruthy();
    // A country opens one level deep: the way back is in its bar, the list comes back.
    expect(screen.queryByRole("tab", { name: "Каталоги организаций (1)" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "← Сайты STIHL стран" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Каталоги организаций (1)" }));
    expect(await screen.findByText("Indokita")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Подтвердить" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));
    expect(await screen.findByText("Совпало с листом")).toBeTruthy();
    expect(screen.getByRole("button", { name: "← Каталоги организаций" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    await waitFor(() => expect(calls.find((c) => c.name === "assortment_confirm")?.args).toEqual({ id: "o1s" }));
    // «Отклонить» returns to the list: the draft is gone.
    fireEvent.click(screen.getByRole("button", { name: "Отклонить" }));
    await waitFor(() => expect(calls.find((c) => c.name === "assortment_discard")?.args).toEqual({ id: "o1s" }));
    expect(await screen.findByRole("tab", { name: "Каталоги организаций (1)" })).toBeTruthy();
  });
});

describe("signature and footer of a legal entity", () => {
  it("edits the signature and saves the whole entity", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const entity = {
      id: "e1", code: "msg", name: "MSG", full_name: "LLC MSG", details: "INN 1", address: "St. Petersburg", website: "https://msgcargo.com",
      phone: "", subdomain: "msg.manifestmail.fyi", sandbox: true, language: "en", signature: "Best regards,\n{{sender.name}}", footer: "LLC MSG",
      token_set: true, health_ok: true, health_checked_at: null, health_error: "", quota: null, ready: true, ready_problems: [], senders: [],
    };
    renderSlot({ component: MailHub }, { initial: "entities" } as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canMail: true, canMailSettings: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "mail_entities") return { result: { items: [entity] } };
          if (name === "mail_defaults") return { result: { general: { legal_entity_id: "", sender_id: "" }, audiences: {} } };
          return { result: {} };
        },
      } as never,
    });
    const area = (await screen.findByLabelText("Подпись")) as HTMLTextAreaElement;
    expect(area.value).toContain("{{sender.name}}");
    fireEvent.change(area, { target: { value: "Kind regards,\n{{sender.name}}\nWhatsApp: +7 900" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(calls.find((c) => c.name === "mail_entity_save")).toBeTruthy());
    expect(calls.find((c) => c.name === "mail_entity_save")?.args).toEqual({
      id: "e1", code: "msg", name: "MSG", full_name: "LLC MSG", details: "INN 1", address: "St. Petersburg", website: "https://msgcargo.com",
      phone: "", subdomain: "msg.manifestmail.fyi", language: "en", sandbox: true, signature: "Kind regards,\n{{sender.name}}\nWhatsApp: +7 900", footer: "LLC MSG",
    });
  });
});

describe("attachments: files beside the RFQ", () => {
  it("adds a file from the computer and removes one, keeping the RFQ", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const sheet = { kind: "procurement_sheet", scope: "catalog", source: "auto" };
    const old = { kind: "file", file_id: "f-old", filename: "old terms.pdf", size: 120_000 };
    renderSlot({ component: DraftAttachments }, { companyId: "c1", specs: [sheet, old], onSaved: () => undefined } as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status(),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "mail_file_upload") return { result: { id: "f-new", filename: args.filename, size: 5 } };
          return { result: {} };
        },
      } as never,
    });
    expect(screen.getByText("old terms.pdf")).toBeTruthy();
    expect(screen.getByText("117 КБ")).toBeTruthy();
    const input = screen.getByLabelText("Файл во вложение") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["hello"], "profile.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(calls.map((c) => c.name)).toEqual(["mail_file_upload", "mail_draft_attachments"]));
    expect(calls[0].args).toMatchObject({ filename: "profile.pdf", content_type: "application/pdf", content_base64: btoa("hello") });
    expect(calls[1].args.attachments).toEqual([sheet, { kind: "file", file_id: "f-old" }, { kind: "file", file_id: "f-new" }]);
    fireEvent.click(screen.getByRole("button", { name: "Убрать old terms.pdf" }));
    await waitFor(() => expect(calls.at(-1)?.args.attachments).toEqual([sheet]));
  });
});

describe("rails and deleted chats", () => {
  it("does not return to a remembered chat that was deleted: forgets it and opens the sheet anew", async () => {
    window.sessionStorage.setItem("manifest:last-needs-thread", "th-deleted");
    window.sessionStorage.removeItem("manifest:rail-redirect-at");
    const calls: { method: string; input: unknown }[] = [];
    const r = renderSlot({ component: NeedsPage }, { subPath: "" } as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canProcurement: true, canAssortment: true }),
        thread_alive: (input: unknown) => {
          calls.push({ method: "thread_alive", input });
          return { alive: false };
        },
        chats_list: () => ({ chats: [] }),
        section_ensure: () => ({ sectionId: null }),
        tool: () => ({ result: { items: [] } }),
      } as never,
    });
    await waitFor(() => expect(calls).toEqual([{ method: "thread_alive", input: { threadId: "th-deleted" } }]));
    await waitFor(() => expect(window.sessionStorage.getItem("manifest:last-needs-thread")).toBeNull());
    expect(JSON.stringify(r.navigateCalls)).not.toContain("th-deleted");
  });
});

describe("matching and coverage (EP-108)", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    need_id: "n2", level: 0.5, reason: "generation", via: "family", sku: "45210113540", global_id: "9", name: "HSA 50 hedge trimmer",
    review: true, decided: false, country: "IN", position_no: 2, model_key: "HSA 50.1", kit: false, qty: 10, category: "Мотоножницы",
    url: "https://x", alternatives: [{ global_id: "10", sku: "HA060113534", name: "HSA 60.1", model_key: "HSA 50.1", kit: false, url: "" }], ...over,
  });

  it("matches a country and an organisation's catalog, decides, confirms a draft", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const site = { source_id: "s-in", source_kind: "stihl_country", country: "IN", title: "STIHL IN", snapshot_id: "sn1", draft: false };
    const own = { source_id: "s-co", source_kind: "distributor_site", country: "IN", company_id: "c1", company_name: "Delhi Garden", title: "Сайт · Delhi Garden", snapshot_id: "sn2", draft: true };
    const cov = { full: 1, partial: 1, none: 1, unchecked: 1, positions: 3 };
    renderSlot({ component: NeedSheet }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canProcurement: true, canProcurementManage: true, canAssortment: true }),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          calls.push({ name, args });
          if (name === "procurement_needs") return { result: { items: [], total: 0 } };
          if (name === "assortment_coverage") {
            return { result: { items: [{ country: "IN", by_volume: 62.5, by_positions: 50, ...cov }], sources: [{ ...site, by_volume: 62.5, by_positions: 50, ...cov }, { ...own, by_volume: 70, by_positions: 60, ...cov }] } };
          }
          if (name === "assortment_queue") return { result: { items: [row({ source: own })] } };
          if (name === "assortment_source_choices" && args.source_id === "s-in") {
            return { result: { items: [row({ source: site }), row({ need_id: "n1", level: 1, reason: "", via: "model", review: false, model_key: "MSA 60 C-B", kit: true, position_no: 1, sku: "MA040115806", global_id: "164117", name: "MSA 60 set", source: site })] } };
          }
          if (name === "assortment_source_choices") return { result: { items: [row({ source: own, global_id: "", sku: "", name: "Hedge trimmer HSA 50" })] } };
          if (name === "outreach_list_companies") return { result: { items: [{ id: "c1", display_name: "Delhi Garden", priority: 1, country_code: "IN", countries: ["IN"], coverage: null }], total: 1 } };
          if (name === "assortment_sources") {
            const sn = { id: "sn2", status: "applied", pages_total: 0, pages_done: 0, pages_failed: 0, products: 1, variants: 1, models: 1, error: "", started_at: "2026-10-22T10:00:00Z", finished_at: null, applied_at: "2026-10-22T10:00:00Z", confirmed_at: null };
            return { result: { items: [{ id: "s-co", kind: "distributor_site", country_code: "IN", title: "Сайт · Delhi Garden", base_url: "", company_id: "c1", current: sn, latest: sn }] } };
          }
          return { result: {} };
        },
      } as never,
    });
    // The tab counts what waits for a person: one doubtful choice and one draft.
    expect(await screen.findByRole("button", { name: "Проверить 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Покрытие" }));
    const switcher = await screen.findByRole("tablist", { name: "Сверка по источнику" });
    await waitFor(() => expect(within(switcher).getByRole("tab", { name: /Сайт STIHL страны/ }).getAttribute("aria-selected")).toBe("true"));
    fireEvent.click(await screen.findByText("HSA 50.1"));
    fireEvent.click(await screen.findByRole("button", { name: "Тот же товар" }));
    await waitFor(() => expect(calls.find((c) => c.name === "assortment_decide")?.args).toMatchObject({ need_id: "n2", level: 1, key_kind: "global_id", key: "9" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать" }));
    await waitFor(() => expect(calls.filter((c) => c.name === "assortment_decide").at(-1)?.args).toMatchObject({ key: "10", level: 1 }));
    // The organisation's catalog: a product without an article is decided by name in its catalog.
    fireEvent.click(within(switcher).getByRole("tab", { name: /Delhi Garden/ }));
    // A narrow panel shows the product under the position too (container queries are not
    // evaluated here): either opens the row.
    fireEvent.click((await screen.findAllByText("Hedge trimmer HSA 50"))[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Тот же товар" }));
    await waitFor(() =>
      expect(calls.filter((c) => c.name === "assortment_decide").at(-1)?.args).toMatchObject({ key_kind: "name", key: "Hedge trimmer HSA 50", source_id: "s-co" }),
    );
    // The draft is decided in «Источники»: «Покрытие» leads there.
    fireEvent.click(screen.getByRole("button", { name: "Проверить в источниках" }));
    expect(await screen.findByRole("tab", { name: /Каталоги организаций/ })).toBeTruthy();
    expect(await screen.findByText("Совпало с листом")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    await waitFor(() => expect(calls.find((c) => c.name === "assortment_confirm")?.args).toEqual({ id: "sn2" }));
    // «Проверить»: the draft and the doubtful choice with its source.
    fireEvent.click(screen.getByRole("button", { name: "Проверить 2" }));
    expect(await screen.findByRole("heading", { name: "Черновики каталогов 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Сомнительные выборы 1" })).toBeTruthy();
    // The position as the sheet needs it, then the candidate with where it is.
    expect(screen.getByText("№2")).toBeTruthy();
    expect(screen.getAllByText(/Delhi Garden · сайт/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Тот же" })[0]);
    await waitFor(() => expect(calls.filter((c) => c.name === "assortment_decide").at(-1)?.args).toMatchObject({ need_id: "n2", level: 1, key_kind: "global_id", key: "9" }));
    expect(screen.getByRole("button", { name: "Проверить в источниках" })).toBeTruthy();
  });

  it("shows countries on the map and explains a country without data", async () => {
    renderSlot({ component: NeedSheet }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status({ canProcurement: true, canProcurementManage: true, canAssortment: true }),
        tool: ({ name }: { name: string }) => {
          if (name === "procurement_needs") return { result: { items: [], total: 0 } };
          if (name === "assortment_coverage") {
            return { result: { items: [{ country: "IN", by_volume: 62.5, by_positions: 50, full: 1, partial: 1, none: 1, unchecked: 0, positions: 3 }],
              // A South African distributor also serves Zambia: Zambia gets its rating.
              served: [{ country: "ZM", by_volume: 51, by_positions: 47, company_id: "za1", company_name: "ANDREAS STIHL", source_kind: "stihl_country", source_country: "ZA", draft: false }] } };
          }
          if (name === "assortment_sources") {
            return { result: { items: [
              { kind: "stihl_country", country_code: "IN", company_id: null, current: { id: "s1" } },
              { kind: "stihl_country", country_code: "FR", company_id: null, current: null },
            ] } };
          }
          if (name === "outreach_facets") return { result: { countries: [{ value: "KZ", count: 2 }, { value: "FR", count: 2 }, { value: "IN", count: 1 }, { value: "KG", count: 1 }, { value: "UZ", count: 2 }] } };
          if (name === "outreach_list_companies") return { result: { items: [{ id: "k1", display_name: "Kaz Garden", priority: 1, country_code: "KZ", countries: ["KZ", "KG", "UZ"], coverage: null }], total: 1 } };
          return { result: { items: [] } };
        },
      } as never,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Покрытие" }));
    expect(await screen.findByRole("img", { name: "Карта покрытия закупочного листа" })).toBeTruthy();
    expect(document.querySelectorAll('path[data-via="1"]').length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByTestId("map-marker-KZ"));
    expect(await screen.findByText(/Сайта STIHL на общей платформе у страны нет/)).toBeTruthy();
    expect(await screen.findByText("Kaz Garden")).toBeTruthy();
    expect(screen.getByText(/\+ Киргизия, Узбекистан/)).toBeTruthy();
    expect(screen.getByTestId("map-halo-KG").getAttribute("data-full")).toBe("1");
    expect(screen.getByTestId("map-halo-UZ").getAttribute("data-full")).toBe("0");
    expect(screen.queryByTestId("map-halo-IN")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Организации страны" })).getByRole("button", { name: "Рядом" })).toBeTruthy();
    fireEvent.focus(screen.getByRole("textbox", { name: "Выбрать страну" }));
    fireEvent.click(await screen.findByRole("option", { name: /Франция/ }));
    expect(await screen.findByText(/загрузите его во вкладке «Источники»/)).toBeTruthy();
  });

  it("sorts the list by coverage and shows it in a row", async () => {
    const calls: Record<string, unknown>[] = [];
    renderSlot({ component: RegistryList }, {} as never, {
      pluginId: "manifest",
      rpc: {
        status: () => status(),
        tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
          if (name === "outreach_list_companies") calls.push(args);
          if (name === "outreach_facets") return { result: { regions: [], countries } };
          return { result: { items: [{ ...item("c1", "THK"), coverage: { by_volume: 57.9, by_positions: 54.8, country: "NZ", unchecked: 3 } }], total: 1, limit: 50, offset: 0 } };
        },
      } as never,
    });
    expect(await screen.findByText("58%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Фильтр: Порядок" }));
    fireEvent.click(await screen.findByRole("option", { name: "По покрытию листа" }));
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ sort: "coverage", desc: true }));
  });
});
