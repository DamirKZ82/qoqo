/** Сокращения для крупных сумм — приходят из словаря текущего языка. */
export interface CompactUnits {
  million: string
  thousand: string
}

/**
 * Числа, суммы и даты пишутся по казахстанскому формату — 05.07.2026 и
 * 4 632 810 ₸ — на обоих языках: это конвенция страны, а не языка. От языка
 * зависят только сокращения и названия месяцев, они приходят из словаря.
 *
 * Локаль зафиксирована ещё и потому, что данные локали `kk` есть не в каждом
 * браузере: без неё Intl молча скатывается к формату 07/05/2026 и «KZT».
 */
const LOCALE = 'ru-KZ'

let units: CompactUnits = { million: 'млн', thousand: 'тыс' }
const moneyFormatter = buildMoneyFormatter(LOCALE)
const numberFormatter = buildNumberFormatter(LOCALE)
const compactFormatter = buildCompactFormatter(LOCALE)

function buildMoneyFormatter(value: string) {
  return new Intl.NumberFormat(value, {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0,
  })
}

function buildNumberFormatter(value: string) {
  return new Intl.NumberFormat(value, { maximumFractionDigits: 3 })
}

function buildCompactFormatter(value: string) {
  return new Intl.NumberFormat(value, { maximumFractionDigits: 1 })
}

/** Сокращения крупных сумм зависят от языка: «тыс» или «мың». */
export function setFormatUnits(next: CompactUnits): void {
  units = next
}

export function formatMoney(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? moneyFormatter.format(amount) : '—'
}

/** Короткая сумма для осей и подписей: 12,1 млн вместо 12 140 300 ₸. */
export function formatCompactMoney(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '—'
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `${compactFormatter.format(amount / 1_000_000)} ${units.million}`
  if (abs >= 1_000) return `${Math.round(amount / 1_000)} ${units.thousand}`
  return String(Math.round(amount))
}

/** Изменение к прошлому периоду в процентах. null — если сравнивать не с чем. */
export function growthPercent(
  current: string | number | null | undefined,
  previous: string | number | null | undefined,
): number | null {
  const now = Number(current ?? 0)
  const before = Number(previous ?? 0)
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null
  return ((now - before) / before) * 100
}

export function formatQuantity(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  return Number.isFinite(amount) ? numberFormatter.format(amount) : '—'
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

/** Дата в формате, который принимает <input type="date">. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}
