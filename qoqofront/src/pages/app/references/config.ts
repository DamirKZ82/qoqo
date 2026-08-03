/** Описание поля справочника — по нему строится и таблица, и форма. */
export interface FieldConfig {
  name: string
  label: string
  type?: 'text' | 'number' | 'checkbox' | 'date' | 'ref' | 'color'
  /** Ресурс API для выбора значения, если type === 'ref'. */
  refResource?: string
  required?: boolean
  /** Показывать в списке. */
  inList?: boolean
  helperText?: string
}

export interface ReferenceConfig {
  resource: string
  title: string
  singular: string
  description?: string
  fields: FieldConfig[]
}

const CODE_AND_NAME: FieldConfig[] = [
  { name: 'code', label: 'Код', inList: true },
  { name: 'name', label: 'Наименование', required: true, inList: true },
]

export const REFERENCES: ReferenceConfig[] = [
  {
    resource: 'organizations',
    title: 'Организации',
    singular: 'организацию',
    fields: [
      ...CODE_AND_NAME,
      { name: 'full_name', label: 'Полное наименование' },
      { name: 'bin', label: 'БИН', inList: true },
      { name: 'address', label: 'Адрес' },
      { name: 'phone', label: 'Телефон', inList: true },
    ],
  },
  {
    resource: 'divisions',
    title: 'Подразделения',
    singular: 'подразделение',
    fields: [
      ...CODE_AND_NAME,
      { name: 'organization_id', label: 'Организация', type: 'ref', refResource: 'organizations', inList: true },
      { name: 'parent_id', label: 'Входит в', type: 'ref', refResource: 'divisions' },
    ],
  },
  {
    resource: 'warehouses',
    title: 'Склады',
    singular: 'склад',
    fields: [
      ...CODE_AND_NAME,
      { name: 'organization_id', label: 'Организация', type: 'ref', refResource: 'organizations' },
      { name: 'address', label: 'Адрес', inList: true },
      { name: 'phone', label: 'Телефон' },
    ],
  },
  {
    resource: 'units',
    title: 'Единицы измерения',
    singular: 'единицу измерения',
    fields: [
      ...CODE_AND_NAME,
      { name: 'full_name', label: 'Полное наименование', inList: true },
      { name: 'okei_code', label: 'Код по ОКЕИ', helperText: '166 — килограмм, 796 — штука' },
      { name: 'ratio', label: 'Коэффициент', type: 'number' },
    ],
  },
  {
    resource: 'product-categories',
    title: 'Номенклатурные группы',
    singular: 'группу',
    fields: [
      ...CODE_AND_NAME,
      { name: 'parent_id', label: 'Входит в', type: 'ref', refResource: 'product-categories' },
      { name: 'sort_order', label: 'Порядок', type: 'number' },
    ],
  },
  {
    resource: 'nomenclature',
    title: 'Номенклатура',
    singular: 'номенклатуру',
    fields: [
      ...CODE_AND_NAME,
      { name: 'article', label: 'Артикул', inList: true },
      { name: 'category_id', label: 'Группа', type: 'ref', refResource: 'product-categories', inList: true },
      { name: 'base_unit_id', label: 'Базовая единица', type: 'ref', refResource: 'units' },
      { name: 'price', label: 'Цена', type: 'number', inList: true },
      { name: 'vat_rate', label: 'Ставка НДС, %', type: 'number' },
      { name: 'is_weight_goods', label: 'Весовой товар', type: 'checkbox' },
      { name: 'barcode', label: 'Штрихкод' },
    ],
  },
  {
    resource: 'counterparties',
    title: 'Контрагенты',
    singular: 'контрагента',
    fields: [
      ...CODE_AND_NAME,
      { name: 'full_name', label: 'Полное наименование' },
      { name: 'bin_iin', label: 'БИН / ИИН', inList: true },
      { name: 'is_legal_entity', label: 'Юридическое лицо', type: 'checkbox' },
      { name: 'address', label: 'Адрес' },
      { name: 'phone', label: 'Телефон', inList: true },
      { name: 'email', label: 'Почта' },
      { name: 'contact_person', label: 'Контактное лицо' },
    ],
  },
  {
    resource: 'outlet-types',
    title: 'Типы торговых точек',
    singular: 'тип точки',
    description: 'Магазин, супермаркет, рынок и другие — список можно дополнять.',
    fields: [
      ...CODE_AND_NAME,
      { name: 'color', label: 'Цвет метки', type: 'color', inList: true },
      { name: 'sort_order', label: 'Порядок', type: 'number' },
    ],
  },
  {
    resource: 'outlets',
    title: 'Торговые точки',
    singular: 'торговую точку',
    description: 'Конкретные адреса доставки. Каждая точка принадлежит контрагенту и имеет тип.',
    fields: [
      ...CODE_AND_NAME,
      { name: 'counterparty_id', label: 'Контрагент', type: 'ref', refResource: 'counterparties', required: true, inList: true },
      { name: 'outlet_type_id', label: 'Тип точки', type: 'ref', refResource: 'outlet-types', inList: true },
      { name: 'address', label: 'Адрес', inList: true },
      { name: 'phone', label: 'Телефон' },
      { name: 'contact_person', label: 'Контактное лицо' },
      { name: 'latitude', label: 'Широта', type: 'number' },
      { name: 'longitude', label: 'Долгота', type: 'number' },
    ],
  },
  {
    resource: 'contracts',
    title: 'Договоры',
    singular: 'договор',
    fields: [
      ...CODE_AND_NAME,
      { name: 'counterparty_id', label: 'Контрагент', type: 'ref', refResource: 'counterparties', required: true, inList: true },
      { name: 'organization_id', label: 'Организация', type: 'ref', refResource: 'organizations' },
      { name: 'number', label: 'Номер', inList: true },
      { name: 'contract_date', label: 'Дата', type: 'date', inList: true },
      { name: 'payment_days', label: 'Отсрочка, дней', type: 'number' },
      { name: 'credit_limit', label: 'Кредитный лимит', type: 'number' },
    ],
  },
]

export function findReference(resource: string): ReferenceConfig | undefined {
  return REFERENCES.find((item) => item.resource === resource)
}
