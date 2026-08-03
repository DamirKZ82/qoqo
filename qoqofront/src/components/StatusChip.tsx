import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'

import type { OrderStatus } from '../api/types'

const STATUS_STYLES: Record<OrderStatus, { label: string; color: ChipProps['color'] }> = {
  draft: { label: 'Черновик', color: 'default' },
  new: { label: 'Новая', color: 'secondary' },
  assembling: { label: 'В сборке', color: 'warning' },
  assembled: { label: 'Собрана', color: 'info' },
  shipped: { label: 'Отгружена', color: 'primary' },
  delivered: { label: 'Доставлена', color: 'success' },
  cancelled: { label: 'Отменена', color: 'error' },
}

export function StatusChip({ status, size = 'small' }: { status: OrderStatus; size?: 'small' | 'medium' }) {
  const style = STATUS_STYLES[status] ?? { label: status, color: 'default' as const }
  return <Chip size={size} label={style.label} color={style.color} />
}
