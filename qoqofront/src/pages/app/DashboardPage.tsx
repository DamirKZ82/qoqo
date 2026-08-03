import AddCircleIcon from '@mui/icons-material/AddCircle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'

import { useOrderStats, useOrders } from '../../api/queries'
import { useAuth } from '../../auth/AuthContext'
import { OrderCard } from '../../components/OrderCard'
import { formatMoney } from '../../lib/format'
import { brand } from '../../theme'

const TILES = [
  { key: 'new', label: 'Новые', color: brand.gold, status: 'new' },
  { key: 'assembling', label: 'В сборке', color: brand.greenLight, status: 'assembling' },
  { key: 'assembled', label: 'Собраны', color: brand.green, status: 'assembled' },
  { key: 'shipped', label: 'Отгружены', color: '#5A6B57', status: 'shipped' },
] as const

export function DashboardPage() {
  const { user, hasRole } = useAuth()
  // Сводка обновляется сама: склад должен видеть новые заявки без перезагрузки.
  const { data: stats, isPending } = useOrderStats(20_000)
  const { data: recent } = useOrders({ limit: 5 }, 20_000)

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Здравствуйте, {user?.full_name.split(' ')[0]}</Typography>
        <Typography color="text.secondary">{user?.role_title}</Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        {TILES.map((tile) => (
          <Card key={tile.key}>
            <CardActionArea component={RouterLink} to={`/app/orders?status=${tile.status}`}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {tile.label}
                </Typography>
                {isPending ? (
                  <Skeleton width={48} height={44} />
                ) : (
                  <Typography variant="h3" sx={{ color: tile.color }}>
                    {stats?.[tile.key] ?? 0}
                  </Typography>
                )}
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            <Box>
              <Typography variant="body2" color="text.secondary">
                Заявок сегодня
              </Typography>
              <Typography variant="h4">{stats?.orders_today ?? 0}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                На сумму
              </Typography>
              <Typography variant="h4" sx={{ color: brand.green }}>
                {formatMoney(stats?.total_amount_today)}
              </Typography>
            </Box>
            {hasRole('admin', 'director', 'sales_rep') && (
              <Button
                component={RouterLink}
                to="/app/orders/new"
                variant="contained"
                startIcon={<AddCircleIcon />}
              >
                Новая заявка
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Box>
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          Последние заявки
        </Typography>
        <Stack spacing={1.5}>
          {recent?.items.length === 0 && (
            <Typography color="text.secondary">Заявок пока нет.</Typography>
          )}
          {recent?.items.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </Stack>
      </Box>
    </Stack>
  )
}
