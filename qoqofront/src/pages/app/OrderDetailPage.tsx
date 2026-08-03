import EditIcon from '@mui/icons-material/Edit'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'

import { errorMessage } from '../../api/client'
import { useChangeOrderStatus, useOrder, useSaveAssembly } from '../../api/queries'
import type { OrderStatus } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { StatusChip } from '../../components/StatusChip'
import { useT, type Dictionary } from '../../i18n'
import { formatDate, formatDateTime, formatMoney, formatQuantity } from '../../lib/format'

/** Кнопки перехода статуса: что показать и кому это доступно. */
const ACTIONS: {
  from: OrderStatus
  to: OrderStatus
  label: keyof Dictionary['orderDetail']['actions']
  variant: 'contained' | 'outlined'
  roles: string[]
}[] = [
  { from: 'draft', to: 'new', label: 'send', variant: 'contained', roles: ['admin', 'director', 'sales_rep'] },
  { from: 'new', to: 'assembling', label: 'assemble', variant: 'contained', roles: ['admin', 'director', 'warehouse'] },
  { from: 'assembling', to: 'assembled', label: 'assembled', variant: 'contained', roles: ['admin', 'director', 'warehouse'] },
  { from: 'assembled', to: 'shipped', label: 'ship', variant: 'contained', roles: ['admin', 'director', 'warehouse'] },
  { from: 'shipped', to: 'delivered', label: 'deliver', variant: 'contained', roles: ['admin', 'director', 'warehouse'] },
  { from: 'draft', to: 'cancelled', label: 'cancel', variant: 'outlined', roles: ['admin', 'director', 'sales_rep'] },
  { from: 'new', to: 'cancelled', label: 'cancel', variant: 'outlined', roles: ['admin', 'director', 'sales_rep'] },
  { from: 'assembling', to: 'cancelled', label: 'cancel', variant: 'outlined', roles: ['admin', 'director'] },
  { from: 'assembled', to: 'cancelled', label: 'cancel', variant: 'outlined', roles: ['admin', 'director'] },
]

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: 'right' }}>
        {value}
      </Typography>
    </Stack>
  )
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, hasRole } = useAuth()
  const t = useT()

  const { data: order, isPending } = useOrder(id)
  const changeStatus = useChangeOrderStatus()
  const saveAssembly = useSaveAssembly()

  const [shipped, setShipped] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  // В режиме сборки поля предзаполняются заказанным количеством.
  useEffect(() => {
    if (!order) return
    setShipped(
      Object.fromEntries(
        order.lines.map((line) => [
          line.id,
          String(Number(line.quantity_shipped ?? line.quantity)),
        ]),
      ),
    )
  }, [order])

  if (isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!order) {
    return <Alert severity="error">{t.orderDetail.notFound}</Alert>
  }

  // Объявления функций не видят сужение типа выше, поэтому фиксируем заявку в константе.
  const current = order

  const canEdit =
    (order.status === 'draft' || order.status === 'new') &&
    (hasRole('admin', 'director') || order.author_id === user?.id)

  const isWarehouseMode =
    hasRole('warehouse', 'admin', 'director') &&
    (order.status === 'assembling' || order.status === 'new')

  const actions = ACTIONS.filter(
    (action) => action.from === order.status && user && action.roles.includes(user.role),
  )

  async function runTransition(status: OrderStatus) {
    setError(null)
    try {
      await changeStatus.mutateAsync({ id: current.id, status })
    } catch (err) {
      setError(errorMessage(err, t.orderDetail.statusFailed))
    }
  }

  async function handleSaveAssembly() {
    setError(null)
    try {
      await saveAssembly.mutateAsync({
        id: current.id,
        lines: current.lines.map((line) => ({
          line_id: line.id,
          quantity_shipped: Number(shipped[line.id] ?? line.quantity),
        })),
      })
    } catch (err) {
      setError(errorMessage(err, t.orderDetail.assemblyFailed))
    }
  }

  const busy = changeStatus.isPending || saveAssembly.isPending

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h4">{order.display_number}</Typography>
        <StatusChip status={order.status} size="medium" />
        <Box sx={{ flexGrow: 1 }} />
        {canEdit && (
          <Button
            component={RouterLink}
            to={`/app/orders/${order.id}/edit`}
            startIcon={<EditIcon />}
          >
            {t.common.edit}
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <InfoRow label={t.orderDetail.counterparty} value={order.counterparty_name} />
            <InfoRow
              label={t.orderDetail.outlet}
              value={
                order.outlet_name
                  ? `${order.outlet_name}${order.outlet_type_name ? ` · ${order.outlet_type_name}` : ''}`
                  : '—'
              }
            />
            <InfoRow label={t.orderDetail.address} value={order.delivery_address ?? t.common.dash} />
            <InfoRow label={t.orderDetail.contract} value={order.contract_name ?? t.common.dash} />
            <InfoRow label={t.orderDetail.warehouse} value={order.warehouse_name ?? t.common.dash} />
            <InfoRow label={t.orderDetail.deliveryDate} value={formatDate(order.delivery_date)} />
            <InfoRow label={t.orderDetail.author} value={order.author_name} />
            <InfoRow label={t.orderDetail.createdAt} value={formatDateTime(order.created_at)} />
            {order.comment && <InfoRow label={t.orderDetail.comment} value={order.comment} />}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t.orderDetail.lines(order.lines.length)}
          </Typography>

          <Stack spacing={1.5}>
            {order.lines.map((line) => (
              <Box key={line.id}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {line.nomenclature_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatQuantity(line.quantity)} {line.unit_name ?? ''} ×{' '}
                      {formatMoney(line.price)}
                      {line.quantity_shipped !== null &&
                        t.orderDetail.assembled(formatQuantity(line.quantity_shipped))}
                    </Typography>
                  </Box>

                  {isWarehouseMode ? (
                    <TextField
                      label={t.orderDetail.shippedField}
                      type="number"
                      value={shipped[line.id] ?? ''}
                      onChange={(event) =>
                        setShipped((current) => ({ ...current, [line.id]: event.target.value }))
                      }
                      sx={{ width: 110 }}
                      slotProps={{ htmlInput: { min: 0, step: '0.001' } }}
                    />
                  ) : (
                    <Typography sx={{ fontWeight: 600 }}>{formatMoney(line.amount)}</Typography>
                  )}
                </Stack>
                <Divider sx={{ mt: 1.5 }} />
              </Box>
            ))}
          </Stack>

          <Stack direction="row" sx={{ mt: 2, justifyContent: 'space-between' }}>
            <Typography variant="h6">{t.common.total}</Typography>
            <Typography variant="h6" color="primary">
              {formatMoney(order.total_amount)}
            </Typography>
          </Stack>

          {isWarehouseMode && (
            <Button
              variant="outlined"
              onClick={handleSaveAssembly}
              disabled={busy}
              sx={{ mt: 2 }}
              fullWidth
            >
              {t.orderDetail.saveAssembly}
            </Button>
          )}
        </CardContent>
      </Card>

      {actions.length > 0 && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          {actions.map((action) => (
            <Button
              key={action.to}
              variant={action.variant}
              color={action.to === 'cancelled' ? 'error' : 'primary'}
              size="large"
              onClick={() => runTransition(action.to)}
              disabled={busy}
            >
              {t.orderDetail.actions[action.label]}
            </Button>
          ))}
        </Stack>
      )}

      <Button onClick={() => navigate('/app/orders')}>{t.orderDetail.backToList}</Button>
    </Stack>
  )
}
