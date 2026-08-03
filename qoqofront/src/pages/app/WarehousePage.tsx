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
import { brand } from '../../theme'

// Опрашиваем сервер часто: склад должен видеть заявку почти сразу после отправки.
const POLL_MS = 10_000

const COLUMNS: { status: OrderStatus; title: string; hint: string; color: string }[] = [
  { status: 'new', title: 'Новые', hint: 'Ожидают, чтобы их взяли в работу', color: brand.gold },
  { status: 'assembling', title: 'В сборке', hint: 'Собираются прямо сейчас', color: '#ED6C02' },
  { status: 'assembled', title: 'Собраны', hint: 'Готовы к отгрузке', color: brand.greenLight },
  { status: 'shipped', title: 'Отгружены', hint: 'В пути к точке', color: brand.green },
]

function Column({ status, title, hint, color }: (typeof COLUMNS)[number]) {
  const { data, isPending } = useOrders({ status, limit: 50 }, POLL_MS)

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <CardContent sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          <Badge badgeContent={data?.total ?? 0} color="primary" showZero />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {hint}
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
            Пусто
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
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Склад</Typography>
        <Typography color="text.secondary">
          Заявки появляются автоматически, список обновляется каждые 10 секунд.
        </Typography>
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
          <Column key={column.status} {...column} />
        ))}
      </Box>
    </Stack>
  )
}
