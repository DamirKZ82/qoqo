import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useOrders } from '../../api/queries'
import type { OrderStatus } from '../../api/types'
import { OrderCard } from '../../components/OrderCard'
import { useT, type Dictionary } from '../../i18n'
import { brand } from '../../theme'

// Опрашиваем сервер часто: склад должен видеть заявку почти сразу после отправки.
const POLL_MS = 10_000

type ColumnStatus = Extract<OrderStatus, 'new' | 'assembling' | 'assembled' | 'shipped'>

const COLUMNS: { status: ColumnStatus; color: string }[] = [
  { status: 'new', color: brand.gold },
  { status: 'assembling', color: brand.goldDark },
  { status: 'assembled', color: brand.greenBright },
  { status: 'shipped', color: brand.greenLight },
]

function Column({ status, color, t }: (typeof COLUMNS)[number] & { t: Dictionary }) {
  const { data, isPending } = useOrders({ status, limit: 50 }, POLL_MS)

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <CardContent sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t.statusPlural[status]}
          </Typography>
          <Badge badgeContent={data?.total ?? 0} color="primary" showZero />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {t.warehouse.hints[status]}
        </Typography>
      </CardContent>

      <Box sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {isPending && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {data?.items.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t.warehouse.empty}
          </Typography>
        )}
        {data?.items.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </Box>
    </Card>
  )
}

export function WarehousePage() {
  const t = useT()

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">{t.warehouse.title}</Typography>
        <Typography color="text.secondary">{t.warehouse.subtitle}</Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          alignItems: 'start',
        }}
      >
        {COLUMNS.map((column) => (
          <Column key={column.status} {...column} t={t} />
        ))}
      </Box>
    </Stack>
  )
}
