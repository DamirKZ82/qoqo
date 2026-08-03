import DownloadIcon from '@mui/icons-material/Download'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import TableRowsIcon from '@mui/icons-material/TableRows'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'

import { errorMessage } from '../../api/client'
import {
  downloadBreakdownCsv,
  useBreakdown,
  useReference,
  useSalesReport,
  type ReportFilters,
} from '../../api/queries'
import type { PeriodGroup, ReferenceItem, ReportDimension, ReportTotals } from '../../api/types'
import { useLanguage, useT, type Dictionary } from '../../i18n'
import {
  formatDate,
  formatMoney,
  formatQuantity,
  growthPercent,
  toDateInput,
} from '../../lib/format'
import { SalesChart } from '../../components/SalesChart'
import { periodTitle } from '../../lib/periods'

const DIMENSIONS: ReportDimension[] = [
  'outlet',
  'counterparty',
  'nomenclature',
  'category',
  'sales_rep',
  'warehouse',
]

const GROUPS: PeriodGroup[] = ['day', 'week', 'month']

type PresetKey = keyof Dictionary['reports']['presets']

/** Готовые периоды: их выбирают в 9 случаях из 10, руками даты почти не вводят. */
const PRESETS: { key: PresetKey; range: () => [Date, Date]; group: PeriodGroup }[] = [
  {
    key: 'week',
    group: 'day',
    range: () => {
      const today = new Date()
      const from = new Date(today)
      from.setDate(today.getDate() - 6)
      return [from, today]
    },
  },
  {
    key: 'month',
    group: 'day',
    range: () => {
      const today = new Date()
      const from = new Date(today)
      from.setDate(today.getDate() - 29)
      return [from, today]
    },
  },
  {
    key: 'prevMonth',
    group: 'day',
    range: () => {
      const today = new Date()
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const to = new Date(today.getFullYear(), today.getMonth(), 0)
      return [from, to]
    },
  },
  {
    key: 'quarter',
    group: 'week',
    range: () => {
      const today = new Date()
      const from = new Date(today)
      from.setDate(today.getDate() - 89)
      return [from, today]
    },
  },
  {
    key: 'year',
    group: 'month',
    range: () => {
      const today = new Date()
      const from = new Date(today)
      from.setFullYear(today.getFullYear() - 1)
      from.setDate(from.getDate() + 1)
      return [from, today]
    },
  },
]

interface TileProps {
  label: string
  value: string
  hint?: string
  growth: number | null
  loading: boolean
}

function Tile({ label, value, hint, growth, loading }: TileProps) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        {loading ? (
          <Skeleton width={110} height={40} />
        ) : (
          <Typography variant="h4" sx={{ mt: 0.5 }}>
            {value}
          </Typography>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center', minHeight: 24 }}>
          {/* Изменение меньше десятой процента — шум, чип с «+0,0 %» только мешает. */}
          {growth !== null && Math.abs(growth) >= 0.05 && (
            <Chip
              size="small"
              color={growth >= 0 ? 'success' : 'error'}
              variant="outlined"
              label={`${growth >= 0 ? '+' : '−'}${Math.abs(growth).toFixed(1)} %`}
            />
          )}
          {hint && (
            <Typography variant="caption" color="text.secondary">
              {hint}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

export function ReportsPage() {
  const t = useT()
  const { language } = useLanguage()
  const [preset, setPreset] = useState<PresetKey | null>('month')
  const [groupBy, setGroupBy] = useState<PeriodGroup>('day')
  const [dimension, setDimension] = useState<ReportDimension>('outlet')
  const [asTable, setAsTable] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [exportError, setExportError] = useState<string | null>(null)

  const initial = PRESETS[1].range()
  const [dateFrom, setDateFrom] = useState(toDateInput(initial[0]))
  const [dateTo, setDateTo] = useState(toDateInput(initial[1]))

  const filters: ReportFilters = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      warehouse_id: warehouseId || undefined,
      counterparty_id: counterpartyId || undefined,
    }),
    [dateFrom, dateTo, warehouseId, counterpartyId],
  )

  const { data: report, isPending, error } = useSalesReport(filters, groupBy)
  const { data: breakdown, isPending: breakdownPending } = useBreakdown(filters, dimension)

  const { data: warehouses } = useReference<ReferenceItem>('warehouses', {
    only_active: true,
    limit: 100,
  })
  const { data: counterparties } = useReference<ReferenceItem>('counterparties', {
    only_active: true,
    limit: 200,
  })

  function applyPreset(key: PresetKey) {
    const found = PRESETS.find((item) => item.key === key)
    if (!found) return
    const [from, to] = found.range()
    setPreset(key)
    setGroupBy(found.group)
    setDateFrom(toDateInput(from))
    setDateTo(toDateInput(to))
  }

  async function handleExport() {
    setExportError(null)
    try {
      await downloadBreakdownCsv(filters, dimension, language)
    } catch (cause) {
      setExportError(errorMessage(cause, t.reports.exportFailed))
    }
  }

  const totals: ReportTotals | undefined = report?.totals
  const previous: ReportTotals | undefined = report?.previous
  const comparison = report
    ? t.reports.comparison(formatDate(report.previous_from), formatDate(report.previous_to))
    : null
  const hasSales = (report?.series ?? []).some((point) => Number(point.total_amount) > 0)
  const dimensionLabel = t.reports.dimensionColumn[dimension] ?? t.reports.element

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">{t.reports.title}</Typography>
        <Typography color="text.secondary">{t.reports.subtitle}</Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={preset}
              onChange={(_, value: PresetKey | null) => value && applyPreset(value)}
              sx={{ flexWrap: 'wrap' }}
            >
              {PRESETS.map((item) => (
                <ToggleButton key={item.key} value={item.key}>
                  {t.reports.presets[item.key]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ flexWrap: 'wrap' }}>
              <TextField
                type="date"
                label={t.reports.dateFrom}
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value)
                  setPreset(null)
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                type="date"
                label={t.reports.dateTo}
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value)
                  setPreset(null)
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                select
                label={t.reports.warehouse}
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">{t.reports.allWarehouses}</MenuItem>
                {warehouses?.items.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={t.reports.counterparty}
                value={counterpartyId}
                onChange={(event) => setCounterpartyId(event.target.value)}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">{t.reports.allCounterparties}</MenuItem>
                {counterparties?.items.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{errorMessage(error, t.reports.loadFailed)}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        <Tile
          label={t.reports.amount}
          value={formatMoney(totals?.total_amount)}
          growth={growthPercent(totals?.total_amount, previous?.total_amount)}
          loading={isPending}
        />
        <Tile
          label={t.reports.orders}
          value={String(totals?.orders_count ?? 0)}
          hint={t.reports.linesHint(totals?.positions_count ?? 0)}
          growth={growthPercent(totals?.orders_count, previous?.orders_count)}
          loading={isPending}
        />
        <Tile
          label={t.reports.averageCheck}
          value={formatMoney(totals?.average_check)}
          growth={growthPercent(totals?.average_check, previous?.average_check)}
          loading={isPending}
        />
        <Tile
          label={t.reports.outlets}
          value={String(totals?.outlets_count ?? 0)}
          hint={t.reports.quantityHint(formatQuantity(totals?.quantity))}
          growth={growthPercent(totals?.outlets_count, previous?.outlets_count)}
          loading={isPending}
        />
      </Box>

      {comparison && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
          {comparison}
        </Typography>
      )}

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            <Typography variant="h5">{t.reports.dynamics}</Typography>
            <Stack direction="row" spacing={1}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={groupBy}
                onChange={(_, value: PeriodGroup | null) => value && setGroupBy(value)}
              >
                {GROUPS.map((item) => (
                  <ToggleButton key={item} value={item}>
                    {t.reports.groups[item]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={asTable ? 'table' : 'chart'}
                onChange={(_, value: string | null) => value && setAsTable(value === 'table')}
              >
                <ToggleButton value="chart" aria-label={t.reports.asChart}>
                  <ShowChartIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="table" aria-label={t.reports.asTable}>
                  <TableRowsIcon fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Stack>

          {isPending && <Skeleton variant="rounded" height={260} />}

          {!isPending && !hasSales && (
            <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
              {t.reports.noSales}
            </Typography>
          )}

          {!isPending && hasSales && !asTable && <SalesChart points={report?.series ?? []} groupBy={groupBy} />}

          {!isPending && hasSales && asTable && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 420 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t.reports.period}</TableCell>
                    <TableCell align="right">{t.reports.ordersColumn}</TableCell>
                    <TableCell align="right">{t.reports.amountColumn}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report?.series.map((point) => (
                    <TableRow key={point.period}>
                      <TableCell>{periodTitle(point.period, groupBy, t)}</TableCell>
                      <TableCell align="right">{point.orders_count}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatMoney(point.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            <Typography variant="h5">{t.reports.breakdown}</Typography>
            <Button size="small" startIcon={<DownloadIcon />} onClick={handleExport}>
              {t.reports.exportCsv}
            </Button>
          </Stack>

          <Tabs
            value={dimension}
            onChange={(_, value: ReportDimension) => setDimension(value)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ mb: 1 }}
          >
            {DIMENSIONS.map((item) => (
              <Tab key={item} value={item} label={t.reports.dimensions[item]} />
            ))}
          </Tabs>

          {exportError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {exportError}
            </Alert>
          )}

          {breakdownPending && <Skeleton variant="rounded" height={220} />}

          {!breakdownPending && breakdown?.rows.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              {t.reports.noData}
            </Typography>
          )}

          {!breakdownPending && (breakdown?.rows.length ?? 0) > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 680 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{dimensionLabel}</TableCell>
                    <TableCell align="right">{t.reports.ordersColumn}</TableCell>
                    <TableCell align="right">{t.reports.quantity}</TableCell>
                    <TableCell align="right">{t.reports.amountColumn}</TableCell>
                    <TableCell align="right" sx={{ minWidth: 120 }}>
                      {t.reports.share}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {breakdown?.rows.map((row) => (
                    <TableRow key={row.id ?? row.name} hover>
                      <TableCell>{row.name}</TableCell>
                      <TableCell align="right">{row.orders_count}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatQuantity(row.quantity)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatMoney(row.total_amount)}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(row.share * 100, 100)}
                            sx={{
                              flexGrow: 1,
                              height: 6,
                              borderRadius: 3,
                              bgcolor: 'action.selected',
                              '& .MuiLinearProgress-bar': { bgcolor: 'primary.main' },
                            }}
                          />
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ minWidth: 38, fontVariantNumeric: 'tabular-nums' }}
                          >
                            {(row.share * 100).toFixed(1)} %
                          </Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {breakdown && Number(breakdown.shown_amount) < Number(breakdown.total_amount) && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  {t.reports.tail(
                    breakdown.rows.length,
                    formatMoney(Number(breakdown.total_amount) - Number(breakdown.shown_amount)),
                  )}
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  )
}
