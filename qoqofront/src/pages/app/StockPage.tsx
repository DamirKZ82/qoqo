import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import SearchIcon from '@mui/icons-material/Search'

import Alert from '@mui/material/Alert'
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
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Autocomplete from '@mui/material/Autocomplete'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, errorMessage } from '../../api/client'
import { useReference } from '../../api/queries'
import type { Nomenclature, Page, ReferenceItem } from '../../api/types'
import { formatDateTime, formatMoney, formatQuantity } from '../../lib/format'

type DocumentType = 'receipt' | 'writeoff' | 'inventory' | 'shipment'

interface BalanceRow {
  warehouse_id: string
  warehouse_name: string
  nomenclature_id: string
  nomenclature_name: string
  nomenclature_code: string | null
  unit_name: string | null
  quantity: string
  reserved: string
  available: string
}

interface StockDocument {
  id: string
  display_number: string
  document_type: DocumentType
  document_type_title: string
  status: 'draft' | 'posted'
  document_date: string
  warehouse_name: string
  author_name: string | null
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

const CREATABLE: { value: DocumentType; label: string; hint: string }[] = [
  { value: 'receipt', label: 'Поступление', hint: 'Товар пришёл на склад' },
  { value: 'writeoff', label: 'Списание', hint: 'Брак, порча, недостача' },
  {
    value: 'inventory',
    label: 'Инвентаризация',
    hint: 'Фактический остаток — расхождение спишется или оприходуется само',
  },
]

let counter = 0
const nextKey = () => `line-${(counter += 1)}`

function BalanceTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const [search, setSearch] = useState('')

  const { data: warehouses } = useReference<ReferenceItem>('warehouses', { limit: 100 })
  const { data, isPending } = useQuery({
    queryKey: ['stock', 'balance', warehouseId, search],
    queryFn: async () =>
      (
        await api.get<BalanceRow[]>('/stock/balance', {
          params: { warehouse_id: warehouseId || undefined, search: search || undefined },
        })
      ).data,
    refetchInterval: 30_000,
  })

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          label="Склад"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">Все склады</MenuItem>
          {warehouses?.items.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          placeholder="Поиск по наименованию"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          fullWidth
        />
      </Stack>

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && data.length === 0 && (
        <Alert severity="info">
          Движений по складам ещё не было. Заведите поступление — остаток появится после
          проведения документа.
        </Alert>
      )}

      {data && data.length > 0 && (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Номенклатура</TableCell>
                  <TableCell>Склад</TableCell>
                  <TableCell align="right">Остаток</TableCell>
                  <TableCell align="right">В резерве</TableCell>
                  <TableCell align="right">Свободно</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row) => {
                  const free = Number(row.available)
                  return (
                    <TableRow key={`${row.warehouse_id}-${row.nomenclature_id}`} hover>
                      <TableCell>
                        <Stack>
                          <Typography variant="body2">{row.nomenclature_name}</Typography>
                          {row.nomenclature_code && (
                            <Typography variant="caption" color="text.secondary">
                              {row.nomenclature_code}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>{row.warehouse_name}</TableCell>
                      <TableCell align="right">
                        {formatQuantity(row.quantity)} {row.unit_name ?? ''}
                      </TableCell>
                      <TableCell align="right">
                        {Number(row.reserved) > 0 ? formatQuantity(row.reserved) : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          // Отрицательное «свободно» означает, что обещано больше,
                          // чем есть, — это надо видеть сразу.
                          sx={{ fontWeight: 700, color: free < 0 ? 'error.main' : 'inherit' }}
                        >
                          {formatQuantity(row.available)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Stack>
  )
}

function DocumentsTab() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<DocumentType>('receipt')
  const [warehouseId, setWarehouseId] = useState('')
  const [comment, setComment] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [error, setError] = useState<string | null>(null)

  const { data: warehouses } = useReference<ReferenceItem>('warehouses', { limit: 100 })
  const { data: products } = useReference<Nomenclature>('nomenclature', { limit: 300 })

  const { data, isPending } = useQuery({
    queryKey: ['stock', 'documents'],
    queryFn: async () =>
      (await api.get<Page<StockDocument>>('/stock/documents', { params: { limit: 100 } })).data,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['stock'] })

  const save = useMutation({
    mutationFn: async () => {
      const { data: created } = await api.post<StockDocument>('/stock/documents', {
        document_type: type,
        warehouse_id: warehouseId,
        comment: comment || null,
        lines: lines.map((line) => ({
          nomenclature_id: line.nomenclature_id,
          quantity: Number(line.quantity || 0),
          price: Number(line.price || 0),
        })),
      })
      // Заводим и сразу проводим: документ без проведения на остаток не влияет,
      // и оставлять его черновиком по умолчанию было бы неожиданно.
      await api.post(`/stock/documents/${created.id}/post`)
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
    mutationFn: async (id: string) => api.post(`/stock/documents/${id}/post`),
    onSuccess: refresh,
  })
  const unpost = useMutation({
    mutationFn: async (id: string) => api.post(`/stock/documents/${id}/unpost`),
    onSuccess: refresh,
  })

  function addProduct(product: Nomenclature | null) {
    if (!product) return
    setLines((current) =>
      current.some((line) => line.nomenclature_id === product.id)
        ? current
        : [
            ...current,
            {
              key: nextKey(),
              nomenclature_id: product.id,
              name: product.name,
              quantity: '1',
              price: String(Number(product.price)),
            },
          ],
    )
  }

  async function handleSave() {
    setError(null)
    if (!warehouseId) {
      setError('Выберите склад')
      return
    }
    if (lines.length === 0) {
      setError('Добавьте хотя бы одну позицию')
      return
    }
    try {
      await save.mutateAsync()
    } catch (cause) {
      setError(errorMessage(cause, 'Не удалось сохранить документ'))
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography color="text.secondary" variant="body2" sx={{ flexGrow: 1 }}>
          Остаток меняют только проведённые документы.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          Документ
        </Button>
      </Stack>

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && data.items.length === 0 && (
        <Typography color="text.secondary">Документов пока нет.</Typography>
      )}

      {data && data.items.length > 0 && (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Документ</TableCell>
                  <TableCell>Склад</TableCell>
                  <TableCell align="right">Позиций</TableCell>
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
                          {row.display_number} · {row.document_type_title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(row.document_date)}
                          {row.author_name ? ` · ${row.author_name}` : ''}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{row.warehouse_name}</TableCell>
                    <TableCell align="right">{row.lines_count}</TableCell>
                    <TableCell align="right">{formatMoney(row.total_amount)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={row.status === 'posted' ? 'success' : 'default'}
                        label={row.status === 'posted' ? 'проведён' : 'черновик'}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {row.status === 'posted' ? (
                        <Button
                          size="small"
                          onClick={() => unpost.mutate(row.id)}
                          disabled={row.document_type === 'shipment'}
                        >
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
        <DialogTitle>Новый складской документ</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              select
              label="Вид документа"
              value={type}
              onChange={(event) => setType(event.target.value as DocumentType)}
              helperText={CREATABLE.find((item) => item.value === type)?.hint}
              fullWidth
            >
              {CREATABLE.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Склад"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              required
              fullWidth
            >
              {warehouses?.items.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>

            <Autocomplete
              options={products?.items ?? []}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={null}
              blurOnSelect
              onChange={(_, value) => addProduct(value)}
              renderInput={(params) => <TextField {...params} label="Добавить позицию" />}
            />

            {lines.map((line) => (
              <Stack key={line.key} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                  {line.name}
                </Typography>
                <TextField
                  label={type === 'inventory' ? 'Факт' : 'Кол-во'}
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
                  aria-label="Удалить"
                >
                  <DeleteIcon />
                </IconButton>
              </Stack>
            ))}

            <TextField
              label="Комментарий"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              fullWidth
            />
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

export function StockPage() {
  const [tab, setTab] = useState(0)

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Остатки</Typography>
        <Typography color="text.secondary" variant="body2">
          Остаток считается по движениям документов, поэтому он не может разойтись с ними.
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(_, value: number) => setTab(value)}>
        <Tab label="Остатки" />
        <Tab label="Документы" />
      </Tabs>

      {tab === 0 ? <BalanceTab /> : <DocumentsTab />}
    </Stack>
  )
}
