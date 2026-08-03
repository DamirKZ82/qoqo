import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { useTopReport, type ReportFilters } from '../api/queries'
import type { ReportDimension } from '../api/types'
import { useT } from '../i18n'
import { formatMoney, formatQuantity } from '../lib/format'

const DIMENSIONS: ReportDimension[] = [
  'nomenclature',
  'category',
  'outlet',
  'counterparty',
  'sales_rep',
  'warehouse',
]

const TOP_LIMITS = [5, 10, 20, 50]

/** Значок и цвет прироста. null — в прошлом периоде продаж не было. */
function growthOf(change: number | null) {
  if (change === null) return { icon: <TrendingFlatIcon fontSize="small" />, color: 'default' as const }
  if (change > 0.02) return { icon: <TrendingUpIcon fontSize="small" />, color: 'success' as const }
  if (change < -0.02) return { icon: <TrendingDownIcon fontSize="small" />, color: 'error' as const }
  return { icon: <TrendingFlatIcon fontSize="small" />, color: 'default' as const }
}

export function TopSales({
  filters,
  dimension,
  onDimensionChange,
}: {
  filters: ReportFilters
  dimension: ReportDimension
  onDimensionChange: (value: ReportDimension) => void
}) {
  const t = useT()
  const [limit, setLimit] = useState(10)
  const { data, isPending } = useTopReport(filters, dimension, limit)

  const leader = data?.rows[0]

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, mb: 2 }}
        >
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">{t.reports.top.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t.reports.top.subtitle}
            </Typography>
          </Box>

          <TextField
            select
            size="small"
            label={t.reports.top.limit}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            sx={{ minWidth: 110 }}
          >
            {TOP_LIMITS.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label={t.reports.breakdown}
            value={dimension}
            onChange={(event) => onDimensionChange(event.target.value as ReportDimension)}
            sx={{ minWidth: 190 }}
          >
            {DIMENSIONS.map((item) => (
              <MenuItem key={item} value={item}>
                {t.reports.dimensions[item]}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {isPending && <Skeleton height={220} />}

        {data && data.rows.length === 0 && (
          <Typography color="text.secondary">{t.reports.empty}</Typography>
        )}

        <Stack spacing={1.5}>
          {data?.rows.map((row, index) => {
            const growth = growthOf(row.change)
            return (
              <Box key={row.id ?? `row-${index}`}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Typography
                    sx={{ width: 24, textAlign: 'right', color: 'text.secondary', fontWeight: 700 }}
                  >
                    {index + 1}
                  </Typography>

                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {row.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatQuantity(row.quantity)} · {t.reports.ordersShort}: {row.orders_count}
                    </Typography>
                  </Box>

                  <Chip
                    size="small"
                    icon={growth.icon}
                    color={growth.color}
                    variant={growth.color === 'default' ? 'outlined' : 'filled'}
                    label={
                      row.change === null
                        ? t.reports.top.isNew
                        : `${row.change > 0 ? '+' : ''}${Math.round(row.change * 100)}%`
                    }
                  />

                  <Typography sx={{ fontWeight: 700, minWidth: 110, textAlign: 'right' }}>
                    {formatMoney(row.total_amount)}
                  </Typography>
                </Stack>

                <LinearProgress
                  variant="determinate"
                  // Доля от лидера, а не от общей суммы: так разница между
                  // соседями в списке видна, даже когда все доли мелкие.
                  value={
                    leader && Number(leader.total_amount) > 0
                      ? (Number(row.total_amount) / Number(leader.total_amount)) * 100
                      : 0
                  }
                  sx={{ mt: 0.75, height: 6, borderRadius: 3 }}
                />
              </Box>
            )
          })}
        </Stack>
      </CardContent>
    </Card>
  )
}
