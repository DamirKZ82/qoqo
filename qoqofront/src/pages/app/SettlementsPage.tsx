import AddIcon from '@mui/icons-material/Add'
import WarningIcon from '@mui/icons-material/Warning'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
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
import type { ReferenceItem } from '../../api/types'
import { formatDate, formatMoney } from '../../lib/format'

interface SettlementRow {
  counterparty_id: string
  counterparty_name: string
  charged: string
  paid: string
  debt: string
  overdue: string
  oldest_overdue_days: number
  credit_limit: string
  credit_left: string | null
}

interface ChargeRow {
  order_id: string
  display_number: string
  order_date: string
  due_date: string
  amount: string
  paid: string
  outstanding: string
  overdue_days: number
}

interface PaymentRow {
  id: string
  display_number: string
  payment_date: string
  amount: string
  method_title: string
  comment: string | null
}

interface Statement {
  counterparty_name: string
  charged: string
  paid: string
  debt: string
  overdue: string
  aging: { current: string; d1_7: string; d8_14: string; d15_30: string; d30_plus: string }
  charges: ChargeRow[]
  payments: PaymentRow[]
}

const METHODS = [
  { value: 'bank', label: 'Банк' },
  { value: 'cash', label: 'Наличные' },
  { value: 'card', label: 'Карта' },
]

const AGING_LABELS: { key: keyof Statement['aging']; label: string }[] = [
  { key: 'current', label: 'Срок не наступил' },
  { key: 'd1_7', label: '1–7 дней' },
  { key: 'd8_14', label: '8–14 дней' },
  { key: 'd15_30', label: '15–30 дней' },
  { key: 'd30_plus', label: 'больше 30' },
]

function PaymentDialog({
  open,
  counterpartyId,
  onClose,
}: {
  open: boolean
  counterpartyId?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [party, setParty] = useState(counterpartyId ?? '')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: counterparties } = useReference<ReferenceItem>('counterparties', { limit: 300 })

  const save = useMutation({
    mutationFn: async () =>
      api.post('/settlements/payments', {
        counterparty_id: party,
        amount: Number(amount),
        method,
        comment: comment || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] })
      onClose()
      setAmount('')
      setComment('')
    },
  })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Оплата от контрагента</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Alert severity="info">
            Оплата гасит долг с самой старой отгрузки — так же, как это делает бухгалтер.
          </Alert>

          <TextField
            select
            label="Контрагент"
            value={party}
            onChange={(event) => setParty(event.target.value)}
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
            label="Сумма"
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
            required
            fullWidth
          />

          <TextField
            select
            label="Способ"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            fullWidth
          >
            {METHODS.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Комментарий"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={save.isPending || !party || !amount}
          onClick={async () => {
            setError(null)
            try {
              await save.mutateAsync()
            } catch (cause) {
              setError(errorMessage(cause, 'Не удалось сохранить оплату'))
            }
          }}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function StatementDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isPending } = useQuery({
    queryKey: ['settlements', 'statement', id],
    queryFn: async () =>
      (await api.get<Statement>(`/settlements/counterparties/${id}`)).data,
    enabled: Boolean(id),
  })

  return (
    <Dialog open={Boolean(id)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{data?.counterparty_name ?? 'Акт сверки'}</DialogTitle>
      <DialogContent>
        {isPending && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        )}

        {data && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Отгружено
                </Typography>
                <Typography variant="h6">{formatMoney(data.charged)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Оплачено
                </Typography>
                <Typography variant="h6">{formatMoney(data.paid)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Долг
                </Typography>
                <Typography variant="h6" color="primary">
                  {formatMoney(data.debt)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Просрочено
                </Typography>
                <Typography variant="h6" color={Number(data.overdue) > 0 ? 'error' : 'inherit'}>
                  {formatMoney(data.overdue)}
                </Typography>
              </Box>
            </Stack>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Долг по срокам
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                {AGING_LABELS.map((item) => (
                  <Chip
                    key={item.key}
                    size="small"
                    label={`${item.label}: ${formatMoney(data.aging[item.key])}`}
                    color={
                      item.key === 'current' || Number(data.aging[item.key]) === 0
                        ? 'default'
                        : 'error'
                    }
                    variant={Number(data.aging[item.key]) === 0 ? 'outlined' : 'filled'}
                  />
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Отгрузки
              </Typography>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Заявка</TableCell>
                      <TableCell>Дата</TableCell>
                      <TableCell>Оплатить до</TableCell>
                      <TableCell align="right">Сумма</TableCell>
                      <TableCell align="right">Оплачено</TableCell>
                      <TableCell align="right">Осталось</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.charges.map((row) => (
                      <TableRow key={row.order_id} hover>
                        <TableCell>{row.display_number}</TableCell>
                        <TableCell>{formatDate(row.order_date)}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                            <span>{formatDate(row.due_date)}</span>
                            {row.overdue_days > 0 && (
                              <Chip
                                size="small"
                                color="error"
                                label={`+${row.overdue_days} дн.`}
                              />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{formatMoney(row.amount)}</TableCell>
                        <TableCell align="right">{formatMoney(row.paid)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatMoney(row.outstanding)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {data.payments.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Оплаты
                </Typography>
                <Stack spacing={0.5}>
                  {data.payments.map((row) => (
                    <Stack key={row.id} direction="row" spacing={2}>
                      <Typography variant="body2" sx={{ minWidth: 110 }}>
                        {row.display_number}
                      </Typography>
                      <Typography variant="body2" sx={{ minWidth: 100 }}>
                        {formatDate(row.payment_date)}
                      </Typography>
                      <Typography variant="body2" sx={{ minWidth: 90 }}>
                        {row.method_title}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatMoney(row.amount)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  )
}

export function SettlementsPage() {
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [statementId, setStatementId] = useState<string | null>(null)

  const { data, isPending } = useQuery({
    queryKey: ['settlements', 'summary', onlyOverdue],
    queryFn: async () =>
      (
        await api.get<{ rows: SettlementRow[]; total_debt: string; total_overdue: string }>(
          '/settlements',
          { params: { only_overdue: onlyOverdue } },
        )
      ).data,
  })

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Взаиморасчёты</Typography>
        <Typography color="text.secondary" variant="body2">
          Долг считается как отгруженное минус оплаченное, срок оплаты — из отсрочки по договору.
        </Typography>
      </Box>

      <Box
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 2fr' } }}
      >
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Общий долг
            </Typography>
            <Typography variant="h4">{formatMoney(data?.total_debt)}</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Просрочено
            </Typography>
            <Typography variant="h4" color={Number(data?.total_overdue ?? 0) > 0 ? 'error' : 'inherit'}>
              {formatMoney(data?.total_overdue)}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <FormControlLabel
          control={
            <Switch
              checked={onlyOverdue}
              onChange={(event) => setOnlyOverdue(event.target.checked)}
            />
          }
          label="Только просроченные"
        />
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setPaymentOpen(true)}>
          Оплата
        </Button>
      </Stack>

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && data.rows.length === 0 && (
        <Alert severity="success">Задолженности нет.</Alert>
      )}

      {data && data.rows.length > 0 && (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Контрагент</TableCell>
                  <TableCell align="right">Отгружено</TableCell>
                  <TableCell align="right">Оплачено</TableCell>
                  <TableCell align="right">Долг</TableCell>
                  <TableCell align="right">Просрочено</TableCell>
                  <TableCell align="right">Лимит</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.counterparty_id} hover>
                    <TableCell>{row.counterparty_name}</TableCell>
                    <TableCell align="right">{formatMoney(row.charged)}</TableCell>
                    <TableCell align="right">{formatMoney(row.paid)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {formatMoney(row.debt)}
                    </TableCell>
                    <TableCell align="right">
                      {Number(row.overdue) > 0 ? (
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                          <WarningIcon fontSize="small" color="error" />
                          <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
                            {formatMoney(row.overdue)} · {row.oldest_overdue_days} дн.
                          </Typography>
                        </Stack>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {row.credit_left === null ? (
                        '—'
                      ) : (
                        <Typography
                          variant="body2"
                          // Отрицательный остаток лимита означает, что отгрузили
                          // больше, чем договорились.
                          color={Number(row.credit_left) < 0 ? 'error' : 'text.secondary'}
                        >
                          осталось {formatMoney(row.credit_left)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => setStatementId(row.counterparty_id)}>
                        Сверка
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <PaymentDialog open={paymentOpen} onClose={() => setPaymentOpen(false)} />
      <StatementDialog id={statementId} onClose={() => setStatementId(null)} />
    </Stack>
  )
}
