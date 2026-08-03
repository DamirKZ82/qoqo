import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

import { useTurnoverReport, type ReportFilters } from '../api/queries'
import type { TurnoverStatus } from '../api/types'
import { useT } from '../i18n'
import { formatDate, formatMoney } from '../lib/format'

const STATUS_COLORS: Record<TurnoverStatus, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  sleeping: 'warning',
  lost: 'error',
  no_orders: 'default',
}

export function TurnoverTable({ filters }: { filters: ReportFilters }) {
  const t = useT()
  const { data, isPending } = useTurnoverReport(filters)

  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{t.reports.turnover.title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t.reports.turnover.subtitle}
        </Typography>

        <Alert severity="info" sx={{ mb: 2 }}>
          {t.reports.turnover.stockNote}
        </Alert>

        {isPending && <Skeleton height={200} />}

        {data && data.rows.length === 0 && (
          <Typography color="text.secondary">{t.reports.empty}</Typography>
        )}

        {data && data.rows.length > 0 && (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t.reports.dimensions.outlet}</TableCell>
                  <TableCell align="right">{t.reports.ordersColumn}</TableCell>
                  <TableCell align="right">{t.reports.turnover.interval}</TableCell>
                  <TableCell align="right">{t.reports.turnover.lastOrder}</TableCell>
                  <TableCell align="right">{t.reports.turnover.averageCheck}</TableCell>
                  <TableCell align="right">{t.reports.amountColumn}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((row, index) => (
                  <TableRow key={row.id ?? `row-${index}`} hover>
                    <TableCell>
                      <Stack>
                        <Typography variant="body2">{row.name}</Typography>
                        {row.outlet_type && (
                          <Typography variant="caption" color="text.secondary">
                            {row.outlet_type}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{row.orders_count}</TableCell>
                    <TableCell align="right">
                      {row.average_interval_days === null
                        ? '—'
                        : t.reports.turnover.days(row.average_interval_days)}
                    </TableCell>
                    <TableCell align="right">
                      <Stack sx={{ alignItems: 'flex-end' }}>
                        <Typography variant="body2">{formatDate(row.last_order)}</Typography>
                        {row.days_since_last !== null && (
                          <Typography variant="caption" color="text.secondary">
                            {t.reports.turnover.daysAgo(row.days_since_last)}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{formatMoney(row.average_check)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatMoney(row.total_amount)}
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        color={STATUS_COLORS[row.status]}
                        label={t.reports.turnover.statuses[row.status]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {data && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              {t.reports.turnover.legend(data.sleeping_after_days)}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
