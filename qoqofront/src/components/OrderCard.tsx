import PlaceIcon from '@mui/icons-material/Place'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'

import type { Order } from '../api/types'
import { useT } from '../i18n'
import { formatDate, formatMoney } from '../lib/format'
import { StatusChip } from './StatusChip'

export function OrderCard({ order }: { order: Order }) {
  const t = useT()

  return (
    <Card>
      <CardActionArea component={RouterLink} to={`/app/orders/${order.id}`}>
        <CardContent>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography sx={{ fontWeight: 700 }}>{order.display_number}</Typography>
              <StatusChip status={order.status} />
              <Box sx={{ flexGrow: 1 }} />
              <Typography sx={{ fontWeight: 700 }}>{formatMoney(order.total_amount)}</Typography>
            </Stack>

            <Typography variant="body2">{order.counterparty_name}</Typography>

            {order.outlet_name && (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <PlaceIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {order.outlet_name}
                  {order.outlet_type_name ? ` · ${order.outlet_type_name}` : ''}
                </Typography>
              </Stack>
            )}

            <Typography variant="caption" color="text.secondary">
              {t.orders.delivery(
                formatDate(order.delivery_date),
                order.lines_count,
                order.author_name,
              )}
            </Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
