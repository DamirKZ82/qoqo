const moneyFormatter = new Intl.NumberFormat('ru-KZ', {
  style: 'currency',
  currency: 'KZT',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 })

export function formatMoney(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? moneyFormatter.format(amount) : '—'
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
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('ru-RU', {
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
