import type { Dictionary } from '../../../i18n'

/** Описание поля справочника — по нему строится и таблица, и форма. */
export interface FieldConfig {
  name: string
  label: string
  type?: 'text' | 'number' | 'checkbox' | 'date' | 'ref' | 'color' | 'url'
  /** Ресурс API для выбора значения, если type === 'ref'. */
  refResource?: string
  /** Отбор для списка значений: например, только торговые представители. */
  refParams?: Record<string, string>
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

export function buildReferences(t: Dictionary): ReferenceConfig[] {
  const codeAndName: FieldConfig[] = [
    { name: 'code', label: t.fields.code, inList: true },
    { name: 'name', label: t.fields.name, required: true, inList: true },
  ]

  return [
  {
    resource: 'organizations',
      title: t.referenceTitles['organizations'],
      singular: t.referenceSingulars['organizations'],
    fields: [
      ...codeAndName,
      { name: 'full_name', label: t.fields.fullName },
      { name: 'bin', label: t.fields.bin, inList: true },
      { name: 'address', label: t.fields.address },
      { name: 'phone', label: t.fields.phone, inList: true },
    ],
  },
  {
    resource: 'divisions',
      title: t.referenceTitles['divisions'],
      singular: t.referenceSingulars['divisions'],
    fields: [
      ...codeAndName,
      { name: 'organization_id', label: t.fields.organization, type: 'ref', refResource: 'organizations', inList: true },
      { name: 'parent_id', label: t.fields.parent, type: 'ref', refResource: 'divisions' },
    ],
  },
  {
    resource: 'warehouses',
      title: t.referenceTitles['warehouses'],
      singular: t.referenceSingulars['warehouses'],
    fields: [
      ...codeAndName,
      { name: 'organization_id', label: t.fields.organization, type: 'ref', refResource: 'organizations' },
      { name: 'address', label: t.fields.address, inList: true },
      { name: 'phone', label: t.fields.phone },
    ],
  },
  {
    resource: 'units',
      title: t.referenceTitles['units'],
      singular: t.referenceSingulars['units'],
    fields: [
      ...codeAndName,
      { name: 'full_name', label: t.fields.fullName, inList: true },
      { name: 'okei_code', label: t.fields.okeiCode, helperText: t.fields.okeiHint },
      { name: 'ratio', label: t.fields.ratio, type: 'number' },
    ],
  },
  {
    resource: 'product-categories',
      title: t.referenceTitles['product-categories'],
      singular: t.referenceSingulars['product-categories'],
    fields: [
      ...codeAndName,
      { name: 'parent_id', label: t.fields.parent, type: 'ref', refResource: 'product-categories' },
      { name: 'sort_order', label: t.fields.sortOrder, type: 'number' },
    ],
  },
  {
    resource: 'nomenclature',
      title: t.referenceTitles['nomenclature'],
      singular: t.referenceSingulars['nomenclature'],
    fields: [
      ...codeAndName,
      { name: 'article', label: t.fields.article, inList: true },
      { name: 'category_id', label: t.fields.category, type: 'ref', refResource: 'product-categories', inList: true },
      { name: 'base_unit_id', label: t.fields.baseUnit, type: 'ref', refResource: 'units' },
      { name: 'price', label: t.fields.price, type: 'number', inList: true },
      { name: 'vat_rate', label: t.fields.vatRate, type: 'number' },
      { name: 'is_weight_goods', label: t.fields.isWeightGoods, type: 'checkbox' },
      { name: 'barcode', label: t.fields.barcode },
    ],
  },
  {
    resource: 'counterparties',
      title: t.referenceTitles['counterparties'],
      singular: t.referenceSingulars['counterparties'],
    fields: [
      ...codeAndName,
      { name: 'full_name', label: t.fields.fullName },
      { name: 'bin_iin', label: t.fields.binIin, inList: true },
      { name: 'is_legal_entity', label: t.fields.isLegalEntity, type: 'checkbox' },
      { name: 'address', label: t.fields.address },
      { name: 'phone', label: t.fields.phone, inList: true },
      { name: 'email', label: t.fields.email },
      { name: 'contact_person', label: t.fields.contactPerson },
    ],
  },
  {
    resource: 'outlet-types',
      title: t.referenceTitles['outlet-types'],
      singular: t.referenceSingulars['outlet-types'],
      description: t.referenceDescriptions['outlet-types'],
    fields: [
      ...codeAndName,
      { name: 'color', label: t.fields.color, type: 'color', inList: true },
      { name: 'sort_order', label: t.fields.sortOrder, type: 'number' },
    ],
  },
  {
    resource: 'outlets',
      title: t.referenceTitles['outlets'],
      singular: t.referenceSingulars['outlets'],
      description: t.referenceDescriptions['outlets'],
    fields: [
      ...codeAndName,
      { name: 'counterparty_id', label: t.fields.counterparty, type: 'ref', refResource: 'counterparties', required: true, inList: true },
      { name: 'outlet_type_id', label: t.fields.outletType, type: 'ref', refResource: 'outlet-types', inList: true },
      { name: 'address', label: t.fields.address, inList: true },
      { name: 'phone', label: t.fields.phone },
      { name: 'contact_person', label: t.fields.contactPerson },
      {
        name: 'dgis_url',
        label: t.fields.dgisUrl,
        type: 'url',
        helperText: t.fields.dgisUrlHint,
      },
      {
        name: 'sales_rep_id',
        label: t.fields.salesRep,
        type: 'ref',
        refResource: 'users',
        refParams: { role: 'sales_rep' },
        helperText: t.fields.salesRepHint,
        inList: true,
      },
      { name: 'latitude', label: t.fields.latitude, type: 'number' },
      { name: 'longitude', label: t.fields.longitude, type: 'number' },
    ],
  },
  {
    resource: 'price-types',
    title: t.references.priceTypes,
    singular: t.references.priceTypeSingular,
    description: t.references.priceTypesHint,
    fields: [
      ...codeAndName,
      { name: 'is_default', label: t.fields.isDefault, type: 'checkbox', inList: true },
      { name: 'sort_order', label: t.fields.sortOrder, type: 'number' },
    ],
  },
  {
    resource: 'contracts',
      title: t.referenceTitles['contracts'],
      singular: t.referenceSingulars['contracts'],
    fields: [
      ...codeAndName,
      { name: 'counterparty_id', label: t.fields.counterparty, type: 'ref', refResource: 'counterparties', required: true, inList: true },
      { name: 'organization_id', label: t.fields.organization, type: 'ref', refResource: 'organizations' },
      { name: 'number', label: t.fields.number, inList: true },
      { name: 'contract_date', label: t.fields.date, type: 'date', inList: true },
      { name: 'payment_days', label: t.fields.paymentDays, type: 'number' },
      {
        name: 'price_type_id',
        label: t.fields.priceType,
        type: 'ref',
        refResource: 'price-types',
        inList: true,
      },
      { name: 'discount_percent', label: t.fields.discountPercent, type: 'number', inList: true },
      { name: 'credit_limit', label: t.fields.creditLimit, type: 'number' },
    ],
  },
  ]
}

export function findReference(
  references: ReferenceConfig[],
  resource: string,
): ReferenceConfig | undefined {
  return references.find((item) => item.resource === resource)
}
