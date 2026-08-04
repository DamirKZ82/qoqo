import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import PlaceIcon from '@mui/icons-material/Place'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'

import { api } from '../api/client'
import { formatMoney } from '../lib/format'

interface Period {
  label: string
  orders_count: number
  total_amount: string
  change: number | null
}

interface Alert {
  kind: string
  title: string
  count: number
  amount: string | null
}

interface Dashboard {
  periods: Period[]
  debt: string
  overdue: string
  overdue_counterparties: number
  orders_to_process: number
  out_of_stock: number
  stale_items: number
  visits_planned: number
  visits_done: number
  alerts: Alert[]
}

/** Куда вести по каждой тревоге — чтобы от цифры можно было сразу перейти к делу. */
const ALERT_LINKS: Record<string, string> = {
  overdue: '/app/settlements',
  out_of_stock: '/app/stock',
  stale: '/app/reports',
  visits: '/app/routes',
}

export function DirectorSummary() {
  const { data, isPending } = useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: async () => (await api.get<Dashboard>('/reports/dashboard')).data,
    refetchInterval: 60_000,
  })

  if (isPending) return <Skeleton height={180} />
  if (!data) return null

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
        }}
      >
        {data.periods.map((period) => {
          const growing = (period.change ?? 0) > 0
          return (
            <Card key={period.label}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {period.label}
                </Typography>
                <Typography variant="h5">{formatMoney(period.total_amount)}</Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    заявок {period.orders_count}
                  </Typography>
                  {period.change !== null && (
                    <Chip
                      size="small"
                      color={growing ? 'success' : 'error'}
                      icon={growing ? <TrendingUpIcon /> : <TrendingDownIcon />}
                      label={`${growing ? '+' : ''}${Math.round(period.change * 100)}%`}
                    />
                  )}
                </Stack>
              </CardContent>
            </Card>
          )
        })}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        {[
          {
            label: 'Долг клиентов',
            value: formatMoney(data.debt),
            hint: `просрочено ${formatMoney(data.overdue)}`,
            to: '/app/settlements',
            icon: <WarningAmberIcon fontSize="small" />,
            alarm: Number(data.overdue) > 0,
          },
          {
            label: 'Заявок в работе',
            value: String(data.orders_to_process),
            hint: 'принято, но не отгружено',
            to: '/app/orders',
            icon: <Inventory2Icon fontSize="small" />,
            alarm: false,
          },
          {
            label: 'Без остатка',
            value: String(data.out_of_stock),
            hint: 'позиций нечем отгрузить',
            to: '/app/stock',
            icon: <Inventory2Icon fontSize="small" />,
            alarm: data.out_of_stock > 0,
          },
          {
            label: 'Визиты сегодня',
            value: `${data.visits_done} из ${data.visits_planned}`,
            hint: 'выполнено из плана',
            to: '/app/routes',
            icon: <PlaceIcon fontSize="small" />,
            alarm: data.visits_planned > data.visits_done,
          },
        ].map((tile) => (
          <Card key={tile.label}>
            <CardActionArea component={RouterLink} to={tile.to}>
              <CardContent>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {tile.label}
                  </Typography>
                  {tile.alarm && <Box sx={{ color: 'warning.main' }}>{tile.icon}</Box>}
                </Stack>
                <Typography variant="h6" sx={{ color: tile.alarm ? 'warning.main' : 'inherit' }}>
                  {tile.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {tile.hint}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      {data.alerts.length > 0 && (
        <Stack spacing={1}>
          {data.alerts.map((alert) => (
            <Alert
              key={alert.kind}
              severity={alert.kind === 'overdue' ? 'error' : 'warning'}
              icon={alert.kind === 'stale' ? <HourglassEmptyIcon /> : undefined}
              action={
                <Chip
                  size="small"
                  clickable
                  component={RouterLink}
                  to={ALERT_LINKS[alert.kind] ?? '/app'}
                  label="Открыть"
                />
              }
            >
              {alert.title}: <strong>{alert.count}</strong>
              {alert.amount ? ` на ${formatMoney(alert.amount)}` : ''}
            </Alert>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
