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
  company: Company;
  countries: { id: string; country_code: string; country_title: string; section_label: string; is_primary: boolean }[];
  contacts: Contact[];
  persons: Person[];
  comments: Comment[];
  changes: Change[];
  sources: { id: string; country_title: string; raw_text: string; source_url: string }[];
}
