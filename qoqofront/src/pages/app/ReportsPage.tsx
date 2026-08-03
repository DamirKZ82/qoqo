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
import {
  formatDate,
  formatMoney,
  formatQuantity,
  growthPercent,
  toDateInput,
} from '../../lib/format'
import { SalesChart } from '../../components/SalesChart'
import { brand } from '../../theme'

const DIMENSIONS: { value: ReportDimension; label: string; unit: string }[] = [
  { value: 'outlet', label: 'Торговые точки', unit: 'Точка' },
  { value: 'counterparty', label: 'Контрагенты', unit: 'Контрагент' },
  { value: 'nomenclature', label: 'Номенклатура', unit: 'Позиция' },
  { value: 'category', label: 'Группы', unit: 'Группа' },
  { value: 'sales_rep', label: 'Представители', unit: 'Сотрудник' },
  { value: 'warehouse', label: 'Склады', unit: 'Склад' },
]

const GROUPS: { value: PeriodGroup; label: string }[] = [
  { value: 'day', label: 'Дни' },
  { value: 'week', label: 'Недели' },
  { value: 'month', label: 'Месяцы' },
]

type PresetKey = 'week' | 'month' | 'prev_month' | 'quarter' | 'year'

/** Готовые периоды: их выбирают в 9 случаях из 10, руками даты почти не вводят. */
const PRESETS: { key: PresetKey; label: string; range: () => [Date, Date]; group: PeriodGroup }[] = [
  {
    key: 'week',
    label: '7 дней',
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
    label: '30 дней',
    group: 'day',
    range: () => {
      const today = new Date()
      const from = new Date(today)
      from.setDate(today.getDate() - 29)
      return [from, today]
    },
  },
  {
    key: 'prev_month',
    label: 'Прошлый месяц',
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
    label: 'Квартал',
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
    label: 'Год',
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
      await downloadBreakdownCsv(filters, dimension)
    } catch (cause) {
      setExportError(errorMessage(cause, 'Не удалось выгрузить файл'))
    }
  }

  const totals: ReportTotals | undefined = report?.totals
  const previous: ReportTotals | undefined = report?.previous
  const comparison = report
    ? `Изменение — к периоду ${formatDate(report.previous_from)} — ${formatDate(report.previous_to)}`
    : null
  const hasSales = (report?.series ?? []).some((point) => Number(point.total_amount) > 0)
  const dimensionLabel = DIMENSIONS.find((item) => item.value === dimension)?.unit ?? 'Элемент'

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Отчёты</Typography>
        <Typography color="text.secondary">
          Продажи по отправленным заявкам. Черновики и отменённые не учитываются.
        </Typography>
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
                  {item.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ flexWrap: 'wrap' }}>
              <TextField
                type="date"
                label="С"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value)
                  setPreset(null)
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                type="date"
                label="По"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value)
                  setPreset(null)
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                select
                label="Склад"
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">Все склады</MenuItem>
                {warehouses?.items.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Контрагент"
                value={counterpartyId}
                onChange={(event) => setCounterpartyId(event.target.value)}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">Все контрагенты</MenuItem>
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

      {error && <Alert severity="error">{errorMessage(error, 'Не удалось загрузить отчёт')}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        <Tile
          label="Сумма продаж"
          value={formatMoney(totals?.total_amount)}
          growth={growthPercent(totals?.total_amount, previous?.total_amount)}
          loading={isPending}
        />
        <Tile
          label="Заявок"
          value={String(totals?.orders_count ?? 0)}
          hint={`позиций: ${totals?.positions_count ?? 0}`}
          growth={growthPercent(totals?.orders_count, previous?.orders_count)}
          loading={isPending}
        />
        <Tile
          label="Средний чек"
          value={formatMoney(totals?.average_check)}
          growth={growthPercent(totals?.average_check, previous?.average_check)}
          loading={isPending}
        />
        <Tile
          label="Торговых точек"
          value={String(totals?.outlets_count ?? 0)}
          hint={`продано: ${formatQuantity(totals?.quantity)}`}
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
            <Typography variant="h5">Динамика продаж</Typography>
            <Stack direction="row" spacing={1}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={groupBy}
                onChange={(_, value: PeriodGroup | null) => value && setGroupBy(value)}
              >
                {GROUPS.map((item) => (
                  <ToggleButton key={item.value} value={item.value}>
                    {item.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={asTable ? 'table' : 'chart'}
                onChange={(_, value: string | null) => value && setAsTable(value === 'table')}
              >
                <ToggleButton value="chart" aria-label="Графиком">
                  <ShowChartIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="table" aria-label="Таблицей">
                  <TableRowsIcon fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Stack>

          {isPending && <Skeleton variant="rounded" height={260} />}

          {!isPending && !hasSales && (
            <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
              За выбранный период продаж не было.
            </Typography>
          )}

          {!isPending && hasSales && !asTable && <SalesChart points={report?.series ?? []} />}

          {!isPending && hasSales && asTable && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 420 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Период</TableCell>
                    <TableCell align="right">Заявок</TableCell>
                    <TableCell align="right">Сумма</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report?.series.map((point) => (
                    <TableRow key={point.period}>
                      <TableCell>{point.title}</TableCell>
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
            <Typography variant="h5">В разрезе</Typography>
            <Button size="small" startIcon={<DownloadIcon />} onClick={handleExport}>
              Выгрузить CSV
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
              <Tab key={item.value} value={item.value} label={item.label} />
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
              Данных за период нет.
            </Typography>
          )}

          {!breakdownPending && (breakdown?.rows.length ?? 0) > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 680 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{dimensionLabel}</TableCell>
                    <TableCell align="right">Заявок</TableCell>
                    <TableCell align="right">Количество</TableCell>
                    <TableCell align="right">Сумма</TableCell>
                    <TableCell align="right" sx={{ minWidth: 120 }}>
                      Доля
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
                              bgcolor: 'rgba(0, 83, 59, 0.12)',
                              '& .MuiLinearProgress-bar': { bgcolor: brand.green },
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
                  Показаны первые {breakdown.rows.length} по сумме. Остальное —{' '}
                  {formatMoney(Number(breakdown.total_amount) - Number(breakdown.shown_amount))}, они
                  есть в выгрузке CSV.
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  )
}
