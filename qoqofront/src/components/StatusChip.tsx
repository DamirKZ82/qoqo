import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'

import type { OrderStatus } from '../api/types'
import { useT } from '../i18n'

const STATUS_COLORS: Record<OrderStatus, ChipProps['color']> = {
  draft: 'default',
  new: 'secondary',
  assembling: 'warning',
  assembled: 'info',
  shipped: 'primary',
  delivered: 'success',
  cancelled: 'error',
}

export function StatusChip({
  status,
  size = 'small',
}: {
  status: OrderStatus
  size?: 'small' | 'medium'
}) {
  const t = useT()
  return <Chip size={size} label={t.status[status] ?? status} color={STATUS_COLORS[status]} />
}
