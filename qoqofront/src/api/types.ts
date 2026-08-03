export type UserRole = 'admin' | 'director' | 'accountant' | 'sales_rep' | 'warehouse'

export type OrderStatus =
  | 'draft'
  | 'new'
  | 'assembling'
  | 'assembled'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface CurrentUser {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: UserRole
  role_title: string
  is_active: boolean
  organization_id: string | null
  division_id: string | null
  warehouse_id: string | null
}

export interface AppSettings {
  company_name: string
  legal_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  primary_color: string
  accent_color: string
  hero_title: string | null
  hero_subtitle: string | null
}

export type BlockType =
  | 'hero'
  | 'features'
  | 'catalog'
  | 'about'
  | 'certificates'
  | 'contacts'
  | 'cta'
  | 'news'

export interface ContentBlock {
  id: string
  block_type: BlockType
  block_type_title: string
  title: string | null
  subtitle: string | null
  sort_order: number
  is_visible: boolean
  payload: Record<string, unknown>
}

export type PostCategory = 'news' | 'promo' | 'announcement'

export interface NewsPost {
  id: string
  slug: string
  title: string
  summary: string | null
  body: string | null
  cover_url: string | null
  category: PostCategory
  category_title: string
  is_published: boolean
  is_pinned: boolean
  published_at: string | null
  valid_until: string | null
  created_at: string
}

export interface ReferenceItem {
  id: string
  code: string | null
  name: string
  is_active: boolean
  [key: string]: unknown
}

export interface Nomenclature extends ReferenceItem {
  article: string | null
  category_id: string | null
  category_name: string | null
  base_unit_id: string | null
  unit_name: string | null
  is_weight_goods: boolean
  price: string
  vat_rate: string
}

export interface Outlet extends ReferenceItem {
  counterparty_id: string
  counterparty_name: string | null
  outlet_type_id: string | null
  outlet_type_name: string | null
  outlet_type_color: string | null
  address: string | null
  phone: string | null
  contact_person: string | null
}

export interface OrderLine {
  id: string
  line_number: number
  nomenclature_id: string
  nomenclature_name: string
  unit_id: string | null
  unit_name: string | null
  quantity: string
  price: string
  amount: string
  quantity_shipped: string | null
}

export interface Order {
  id: string
  number: number
  display_number: string
  order_date: string
  delivery_date: string | null
  status: OrderStatus
  status_title: string
  counterparty_id: string
  counterparty_name: string
  outlet_id: string | null
  outlet_name: string | null
  outlet_type_name: string | null
  contract_id: string | null
  contract_name: string | null
  organization_id: string | null
  division_id: string | null
  warehouse_id: string | null
  warehouse_name: string | null
  author_id: string
  author_name: string
  delivery_address: string | null
  comment: string | null
  total_amount: string
  lines_count: number
  created_at: string
  updated_at: string
  lines: OrderLine[]
}

export type PeriodGroup = 'day' | 'week' | 'month'

export type ReportDimension =
  | 'outlet'
  | 'counterparty'
  | 'sales_rep'
  | 'nomenclature'
  | 'category'
  | 'warehouse'

export interface ReportTotals {
  orders_count: number
  total_amount: string
  average_check: string
  positions_count: number
  quantity: string
  outlets_count: number
}

export interface SalesPoint {
  period: string
  label: string
  title: string
  orders_count: number
  total_amount: string
}

export interface SalesReport {
  date_from: string
  date_to: string
  group_by: PeriodGroup
  totals: ReportTotals
  previous: ReportTotals
  previous_from: string
  previous_to: string
  series: SalesPoint[]
}

export interface BreakdownRow {
  id: string | null
  name: string
  orders_count: number
  quantity: string
  total_amount: string
  share: number
}

export interface BreakdownReport {
  dimension: ReportDimension
  dimension_title: string
  date_from: string
  date_to: string
  total_amount: string
  shown_amount: string
  rows: BreakdownRow[]
}

export interface OrderStats {
  draft: number
  new: number
  assembling: number
  assembled: number
  shipped: number
  delivered: number
  cancelled: number
  orders_today: number
  total_amount_today: string
}
