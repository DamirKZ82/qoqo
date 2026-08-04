import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'

import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, errorMessage } from '../../api/client'
import { useReference } from '../../api/queries'
import type { Nomenclature, Outlet, Page, ReferenceItem } from '../../api/types'
import { formatDate, formatMoney } from '../../lib/format'

type Reason = 'expired' | 'defect' | 'surplus' | 'misgrade' | 'other'

const REASONS: { value: Reason; label: string; hint?: string }[] = [
  { value: 'expired', label: 'Истёк срок', hint: 'Обратно в продажу не идёт' },
  { value: 'defect', label: 'Брак', hint: 'Обратно в продажу не идёт' },
  { value: 'surplus', label: 'Не продалось' },
  { value: 'misgrade', label: 'Пересорт' },
  { value: 'other', label: 'Другое' },
]

interface ReturnDoc {
  id: string
  display_number: string
  return_date: string
  status: 'draft' | 'posted'
  counterparty_name: string
  outlet_name: string | null
  warehouse_name: string
  reason_title: string
  unsaleable: boolean
  comment: string | null
  total_amount: string
  lines_count: number
}

interface LineDraft {
  key: string
  nomenclature_id: string
  name: string
  quantity: string
  price: string
}

let counter = 0
const nextKey = () => `line-${(counter += 1)}`

export function ReturnsPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [counterpartyId, setCounterpartyId] = useState('')
  const [outletId, setOutletId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [reason, setReason] = useState<Reason>('surplus')
  const [comment, setComment] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [error, setError] = useState<string | null>(null)

  const { data: counterparties } = useReference<ReferenceItem>('counterparties', { limit: 300 })
  const { data: outlets } = useReference<Outlet>(
    'outlets',
    { limit: 300, counterparty_id: counterpartyId || undefined },
    Boolean(counterpartyId),
  )
  const { data: warehouses } = useReference<ReferenceItem>('warehouses', { limit: 100 })
  const { data: products } = useReference<Nomenclature>('nomenclature', { limit: 300 })

  const { data, isPending } = useQuery({
    queryKey: ['returns'],
    queryFn: async () => (await api.get<Page<ReturnDoc>>('/returns', { params: { limit: 100 } })).data,
  })

  const refresh = () => queryClient.invalidateQueries()

  const save = useMutation({
    mutationFn: async () => {
      const { data: created } = await api.post<ReturnDoc>('/returns', {
        counterparty_id: counterpartyId,
        outlet_id: outletId || null,
        warehouse_id: warehouseId,
        reason,
        comment: comment || null,
        lines: lines.map((line) => ({
          nomenclature_id: line.nomenclature_id,
          quantity: Number(line.quantity || 0),
          price: Number(line.price || 0),
        })),
      })
      // Заводим и сразу проводим: возврат без проведения не меняет ни остаток,
      // ни долг, и оставлять его черновиком по умолчанию было бы неожиданно.
      await api.post(`/returns/${created.id}/post`)
      return created
    },
    onSuccess: () => {
      refresh()
      setOpen(false)
      setLines([])
      setComment('')
    },
  })

  const post = useMutation({
    mutationFn: async (id: string) => api.post(`/returns/${id}/post`),
    onSuccess: refresh,
  })
  const unpost = useMutation({
    mutationFn: async (id: string) => api.post(`/returns/${id}/unpost`),
    onSuccess: refresh,
  })

  const currentReason = REASONS.find((item) => item.value === reason)

  async function handleSave() {
    setError(null)
    if (!counterpartyId || !warehouseId) {
      setError('Выберите контрагента и склад')
      return
    }
    if (lines.length === 0) {
      setError('Добавьте хотя бы одну позицию')
      return
    }
    try {
      await save.mutateAsync()
    } catch (cause) {
      setError(errorMessage(cause, 'Не удалось сохранить возврат'))
    }
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Возвраты</Typography>
        <Typography color="text.secondary" variant="body2">
          Проведённый возврат приходует товар на склад и уменьшает долг контрагента.
        </Typography>
      </Box>

      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          Возврат
        </Button>
      </Stack>

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && data.items.length === 0 && (
        <Alert severity="info">Возвратов пока нет.</Alert>
      )}

      {data && data.items.length > 0 && (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Документ</TableCell>
                  <TableCell>Контрагент</TableCell>
                  <TableCell>Причина</TableCell>
                  <TableCell>Склад</TableCell>
                  <TableCell align="right">Сумма</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Stack>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.display_number}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(row.return_date)} · позиций {row.lines_count}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack>
                        <Typography variant="body2">{row.counterparty_name}</Typography>
                        {row.outlet_name && (
                          <Typography variant="caption" color="text.secondary">
                            {row.outlet_name}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <Typography variant="body2">{row.reason_title}</Typography>
                        {row.unsaleable && (
                          <WarningAmberIcon fontSize="small" color="warning" titleAccess="Не в продажу" />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{row.warehouse_name}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatMoney(row.total_amount)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={row.status === 'posted' ? 'success' : 'default'}
                        label={row.status === 'posted' ? 'проведён' : 'черновик'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {row.status === 'posted' ? (
                        <Button size="small" onClick={() => unpost.mutate(row.id)}>
                          Отменить
                        </Button>
                      ) : (
                        <Button size="small" onClick={() => post.mutate(row.id)}>
                          Провести
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Возврат от клиента</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              select
              label="Контрагент"
              value={counterpartyId}
              onChange={(event) => {
                setCounterpartyId(event.target.value)
                setOutletId('')
              }}
              required
              fullWidth
            >
              {counterparties?.items.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Торговая точка"
              value={outletId}
              onChange={(event) => setOutletId(event.target.value)}
              disabled={!counterpartyId}
              fullWidth
            >
              <MenuItem value="">— не указана —</MenuItem>
              {outlets?.items.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Склад приёмки"
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
                required
                sx={{ flex: 1 }}
              >
                {warehouses?.items.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Причина"
                value={reason}
                onChange={(event) => setReason(event.target.value as Reason)}
                helperText={currentReason?.hint}
                sx={{ flex: 1 }}
              >
                {REASONS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Autocomplete
              options={products?.items ?? []}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={null}
              blurOnSelect
              onChange={(_, value) => {
                if (!value || lines.some((line) => line.nomenclature_id === value.id)) return
                setLines([
                  ...lines,
                  {
                    key: nextKey(),
                    nomenclature_id: value.id,
                    name: value.name,
                    quantity: '1',
                    price: String(Number(value.price)),
                  },
                ])
              }}
              renderInput={(params) => <TextField {...params} label="Добавить позицию" />}
            />

            {lines.map((line) => (
              <Stack key={line.key} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                  {line.name}
                </Typography>
                <TextField
                  label="Кол-во"
                  type="number"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.key === line.key ? { ...item, quantity: event.target.value } : item,
                      ),
                    )
                  }
                  sx={{ width: 110 }}
                  slotProps={{ htmlInput: { min: 0, step: '0.001' } }}
                />
                <TextField
                  label="Цена"
                  type="number"
                  value={line.price}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.key === line.key ? { ...item, price: event.target.value } : item,
                      ),
                    )
                  }
                  sx={{ width: 120 }}
                  slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                />
                <IconButton
                  onClick={() => setLines((current) => current.filter((i) => i.key !== line.key))}
                >
                  <DeleteIcon />
                </IconButton>
              </Stack>
            ))}

            {lines.length > 0 && (
              <Typography sx={{ textAlign: 'right', fontWeight: 700 }}>
                Итого:{' '}
                {formatMoney(
                  lines.reduce(
                    (sum, line) => sum + Number(line.quantity || 0) * Number(line.price || 0),
                    0,
                  ),
                )}
              </Typography>
            )}

            <TextField
              label="Комментарий"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              fullWidth
            />

            <Alert severity="info">
              Цена по умолчанию — текущая цена товара. Если возвращают по конкретной заявке,
              поставьте цену из неё, иначе долг уменьшится не на ту сумму.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSave} disabled={save.isPending}>
            Создать и провести
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
