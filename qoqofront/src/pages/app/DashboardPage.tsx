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
import { useT } from '../../i18n'
import { formatMoney } from '../../lib/format'
import { brand } from '../../theme'

const TILES = [
  { key: 'new', color: brand.gold },
  { key: 'assembling', color: brand.greenLight },
  { key: 'assembled', color: brand.greenBright },
  { key: 'shipped', color: brand.goldDark },
] as const

export function DashboardPage() {
  const { user, hasRole } = useAuth()
  const t = useT()
  // Сводка обновляется сама: склад должен видеть новые заявки без перезагрузки.
  const { data: stats, isPending } = useOrderStats(20_000)
  const { data: recent } = useOrders({ limit: 5 }, 20_000)

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">{t.dashboard.greeting(user?.full_name.split(' ')[0] ?? '')}</Typography>
        <Typography color="text.secondary">{user ? t.roles[user.role] : ''}</Typography>
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
            <CardActionArea component={RouterLink} to={`/app/orders?status=${tile.key}`}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {t.statusPlural[tile.key]}
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
                {t.dashboard.ordersToday}
              </Typography>
              <Typography variant="h4">{stats?.orders_today ?? 0}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                {t.dashboard.amountToday}
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
                {t.nav.newOrder}
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Box>
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          {t.dashboard.recent}
        </Typography>
        <Stack spacing={1.5}>
          {recent?.items.length === 0 && (
            <Typography color="text.secondary">{t.dashboard.empty}</Typography>
          )}
          {recent?.items.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </Stack>
      </Box>
    </Stack>
  )
}
