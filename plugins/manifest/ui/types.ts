// Shapes of Manifest MCP results (contract v1) the panels render.

export interface ListItem {
  id: string;
  display_name: string;
  kind: string;
  region: string;
  country_code: string;
  countries: string[];
  status: string;
  priority: number;
  priority_reason: string;
  priority_manual: boolean;
  do_not_contact: boolean;
  has_phone: boolean;
  has_whatsapp: boolean;
  has_email: boolean;
  has_website: boolean;
  persons: number;
  comments: number;
  updated_at: string;
}

export interface ListResult {
  items: ListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface Facet {
  value: string;
  count: number;
}

export interface Facets {
  regions: Facet[];
  countries: Facet[];
}

export interface Company {
  id: string;
  display_name: string;
  legal_name: string;
  kind: string;
  brands: string[];
  region: string;
  country_code: string;
  address_raw: string;
  city: string;
  map_url: string;
  status: string;
  status_reason: string;
  priority: number;
  priority_auto: number;
  priority_reason: string;
  priority_manual: number | null;
  tags: string[];
  do_not_contact: boolean;
  do_not_contact_reason: string;
  manual_fields: string[];
  updated_at: string;
}

export interface Contact {
  id: string;
  person_id: string | null;
  type: string;
  value_raw: string;
  value_norm: string;
  label: string;
  is_brand_domain: boolean;
  origin: string;
}

export interface Person {
  id: string;
  full_name: string;
  salutation: string;
  position: string;
  languages: string[];
  note: string;
}

export interface Comment {
  id: string;
  author: string;
  body: string;
  pinned: boolean;
  created_at: string;
}

export interface Change {
  id: number;
  entity: string;
  field: string;
  old_value: string;
  new_value: string;
  actor: string;
  at: string;
}

export interface Card {
  company: Company & {
    owner?: string;
    status_reason_code?: string;
    last_touch_at?: string | null;
    touches_count?: number;
  };
  next_action?: NextAction | null;
  interactions?: Interaction[];
  /** Sandbox letters left touches or changed the state; they can be rolled back (W-20). */
  sandbox_traces?: boolean;
  countries: { id: string; country_code: string; country_title: string; section_label: string; is_primary: boolean }[];
  contacts: Contact[];
  persons: Person[];
  comments: Comment[];
  changes: Change[];
  sources: { id: string; country_title: string; raw_text: string; source_url: string }[];
}

// ---- W-15: work layer ----

export interface NextActionBrief {
  action: string;
  note: string;
  due_on: string;
  auto: boolean;
}

export interface WorkListItem extends ListItem {
  status_reason_code?: string;
  tags?: string[];
  owner?: string;
  last_touch_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  touches_count?: number;
  next_action?: NextActionBrief | null;
}

export interface QueueItem extends WorkListItem {
  group: string;
  reason: string;
}

export interface QueueGroup {
  key: string;
  title: string;
  total: number;
  items: QueueItem[];
}

export interface Queue {
  as_of: string;
  today: string;
  groups: QueueGroup[];
}

export interface Metrics {
  as_of: string;
  today: string;
  total: number;
  active: number;
  checks: { waiting_reply: number; overdue: number; due_today: number; no_next_action: number; ready_untouched: number };
  funnel: { status: string; count: number; median_days_in_status: number }[];
  dropoff: { status: string; reason_code: string; count: number }[];
  regions: { region: string; total: number; by_status: Record<string, number> }[];
  aging: { status: string; buckets: Record<string, number> }[];
  quality: {
    by_priority: Record<string, number>;
    brand_only: number;
    no_channels: number;
    with_person: number;
    invalid_contacts: number;
    unassigned: number;
  };
  activity: {
    touches_out_7d: number;
    touches_in_7d: number;
    touched: number;
    replied: number;
    positive_30d: number;
    median_days_to_first: number;
    outbound_companies_7d: number;
  };
}

export interface FeedItem {
  id: number;
  entity: string;
  field: string;
  old_value: string;
  new_value: string;
  actor: string;
  at: string;
  company_id: string;
  company_name: string;
  batch_id: string | null;
}

export interface Segment {
  id: string;
  name: string;
  filter: Record<string, unknown>;
  count?: number;
}

export interface BatchItem {
  company_id: string;
  name: string;
  changes: { field: string; old: string; new: string }[];
  skip?: string;
}

export interface Batch {
  id: string;
  state: "preview" | "applying" | "applied" | "reverted" | "expired";
  summary: string;
  count: number;
  skipped: number;
  items: BatchItem[];
  result: { company_id: string; name: string; ok: boolean; error?: string }[];
  created_by: string;
  created_at: string;
  expires_at: string;
  applied_by: string;
  applied_at: string | null;
  reverted_at: string | null;
}

export interface Interaction {
  id: string;
  channel: string;
  direction: "out" | "in";
  kind: string;
  outcome: string;
  occurred_at: string;
  summary: string;
  ingest: string;
  created_by: string;
  /** A sandbox letter (W-20): the flow is real, the letter was not. */
  sandbox?: boolean;
}

export interface NextAction extends NextActionBrief {
  id: string;
  owner: string;
}
