import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { api } from '../api/client'
import { useReference, type ReportFilters } from '../api/queries'
import type { ReferenceItem } from '../api/types'
import { formatDate, formatQuantity } from '../lib/format'

interface TurnoverRow {
  warehouse_id: string
  warehouse_name: string
  nomenclature_id: string
  nomenclature_name: string
  unit_name: string | null
  opening: string
  closing: string
  average: string
  consumed: string
  received: string
  turnover_ratio: number | null
  days_to_sell: number | null
  days_of_supply: number | null
  last_movement: string | null
  days_without_movement: number | null
}

interface TurnoverReport {
  days: number
  rows: TurnoverRow[]
  stale_after_days: number
}

export function StockTurnover({ filters }: { filters: ReportFilters }) {
  const [warehouseId, setWarehouseId] = useState('')
  const [onlyMoved, setOnlyMoved] = useState(true)

  const { data: warehouses } = useReference<ReferenceItem>('warehouses', { limit: 100 })
  const { data, isPending } = useQuery({
    queryKey: ['reports', 'stock-turnover', filters, warehouseId, onlyMoved],
    queryFn: async () =>
      (
        await api.get<TurnoverReport>('/reports/stock-turnover', {
          params: {
            date_from: filters.date_from,
            date_to: filters.date_to,
            warehouse_id: warehouseId || undefined,
            only_moved: onlyMoved,
          },
        })
      ).data,
    placeholderData: (previous) => previous,
  })

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, mb: 2 }}
        >
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Оборачиваемость запасов</Typography>
            <Typography variant="body2" color="text.secondary">
              За сколько дней распродаётся средний остаток. Сверху — то, что расходится медленнее
              всего: именно там заморожены деньги.
            </Typography>
          </Box>

          <TextField
            select
            size="small"
            label="Склад"
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Все склады</MenuItem>
            {warehouses?.items.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <FormControlLabel
          control={
            <Switch checked={onlyMoved} onChange={(event) => setOnlyMoved(event.target.checked)} />
          }
          label="Только то, что двигалось за период"
        />

        {isPending && <Skeleton height={220} />}

        {data && data.rows.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            За период движений не было. Заведите поступления и отгрузки — оборачиваемость появится.
          </Alert>
        )}

        {data && data.rows.length > 0 && (
          <TableContainer sx={{ overflowX: 'auto', mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Товар</TableCell>
                  <TableCell align="right">Начало</TableCell>
                  <TableCell align="right">Конец</TableCell>
                  <TableCell align="right">Расход</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Расход, делённый на средний остаток">
                      <span>Коэффициент</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="За сколько дней распродаётся средний запас">
                      <span>Дней на продажу</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="На сколько дней хватит текущего остатка при том же темпе">
                      <span>Запас, дней</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>Последнее движение</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((row) => {
                  const stale =
                    row.days_without_movement !== null &&
                    row.days_without_movement > data.stale_after_days
                  return (
                    <TableRow key={`${row.warehouse_id}-${row.nomenclature_id}`} hover>
                      <TableCell>
                        <Stack>
                          <Typography variant="body2">{row.nomenclature_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.warehouse_name}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{formatQuantity(row.opening)}</TableCell>
                      <TableCell align="right">{formatQuantity(row.closing)}</TableCell>
                      <TableCell align="right">{formatQuantity(row.consumed)}</TableCell>
                      <TableCell align="right">
                        {row.turnover_ratio === null ? '—' : row.turnover_ratio.toFixed(2)}
                      </TableCell>
                      <TableCell align="right">
                        {row.days_to_sell === null ? '—' : row.days_to_sell}
                      </TableCell>
                      <TableCell align="right">
                        {row.days_of_supply === null ? '—' : row.days_of_supply}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <Typography variant="body2">{formatDate(row.last_movement)}</Typography>
                          {stale && (
                            <Chip
                              size="small"
                              color="warning"
                              icon={<HourglassEmptyIcon />}
                              label={`${row.days_without_movement} дн.`}
                            />
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  )
}
