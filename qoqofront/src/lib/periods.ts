import type { PeriodGroup } from '../api/types'
import type { Dictionary } from '../i18n'

/**
 * Подписи периодов собираются на клиенте, а не приходят с сервера: смена языка
 * не должна требовать нового запроса. Названия месяцев берём из словаря, а не
 * из Intl, — данные локали `kk` есть не в каждом браузере.
 */

/** «2026-08-03» → дата по местному времени, без сдвига на часовой пояс. */
function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

function dayMonth(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Короткая подпись для оси графика. */
export function periodLabel(period: string, group: PeriodGroup, t: Dictionary): string {
  const date = parseDate(period)
  if (group === 'month') return t.periods.monthShort(date.getMonth())
  return dayMonth(date)
}

/** Полная подпись — для подсказки и таблицы. */
export function periodTitle(period: string, group: PeriodGroup, t: Dictionary): string {
  const date = parseDate(period)

  if (group === 'month') return t.periods.monthTitle(date.getMonth(), date.getFullYear())
  if (group === 'week') {
    const end = new Date(date)
    end.setDate(date.getDate() + 6)
    return `${dayMonth(date)} — ${dayMonth(end)}.${end.getFullYear()}`
  }
  return t.periods.dayTitle(date.getDate(), date.getMonth(), date.getFullYear())
}
