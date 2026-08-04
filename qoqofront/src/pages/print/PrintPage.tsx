import PrintIcon from '@mui/icons-material/Print'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import { api } from '../../api/client'
import { useReference, useSettings } from '../../api/queries'
import type { Order, ReferenceItem } from '../../api/types'
import { Logo } from '../../components/Logo'
import { amountInWords } from '../../lib/amountInWords'
import { formatDate, formatQuantity } from '../../lib/format'

type PrintKind = 'order' | 'waybill' | 'invoice'

const TITLES: Record<PrintKind, (order: Order) => string> = {
  order: (order) => `Заявка ${order.display_number}`,
  waybill: (order) => `Накладная на отпуск товара к заявке ${order.display_number}`,
  invoice: (order) => `Счёт на оплату к заявке ${order.display_number}`,
}

/** Денежный формат без символа валюты: в документах валюта пишется отдельно. */
const money = new Intl.NumberFormat('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatSum(value: string | number | null | undefined): string {
  return money.format(Number(value ?? 0))
}

function Requisites({
  title,
  name,
  bin,
  address,
  phone,
}: {
  title: string
  name: string
  bin?: string | null
  address?: string | null
  phone?: string | null
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 240 }}>
      <Typography sx={{ fontSize: 11, color: '#666' }}>{title}</Typography>
      <Typography sx={{ fontWeight: 700 }}>{name}</Typography>
      {bin && <Typography sx={{ fontSize: 12 }}>БИН/ИИН: {bin}</Typography>}
      {address && <Typography sx={{ fontSize: 12 }}>{address}</Typography>}
      {phone && <Typography sx={{ fontSize: 12 }}>{phone}</Typography>}
    </Box>
  )
}

export function PrintPage() {
  const { kind = 'order', id } = useParams<{ kind: PrintKind; id: string }>()
  const navigate = useNavigate()

  const { data: settings } = useSettings()
  const { data: order, isPending, isError } = useQuery({
    queryKey: ['orders', 'one', id],
    queryFn: async () => (await api.get<Order>(`/orders/${id}`)).data,
    enabled: Boolean(id),
  })

  const { data: organizations } = useReference<ReferenceItem>('organizations', { limit: 50 })
  const { data: counterparties } = useReference<ReferenceItem>('counterparties', { limit: 300 })

  if (isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !order) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Документ не найден.</Alert>
      </Box>
    )
  }

  const organization = organizations?.items.find((item) => item.id === order.organization_id)
  const counterparty = counterparties?.items.find((item) => item.id === order.counterparty_id)

  const isWaybill = kind === 'waybill'
  const isInvoice = kind === 'invoice'

  // В накладной показываем то, что реально отгружено; если склад не проставил
  // факт, берём заказанное.
  const rows = order.lines.map((line) => {
    const quantity = isWaybill && line.quantity_shipped !== null ? line.quantity_shipped : line.quantity
    const amount = Number(quantity) * Number(line.price)
    return { line, quantity, amount }
  })
  const total = rows.reduce((sum, row) => sum + row.amount, 0)

  return (
    <Box
      sx={{
        maxWidth: 900,
        mx: 'auto',
        p: { xs: 2, md: 4 },
        color: '#000',
        bgcolor: '#fff',
        // Печатаем документ, а не интерфейс: панель с кнопками и фон уходят.
        '@media print': {
          p: 0,
          maxWidth: 'none',
          '& .no-print': { display: 'none' },
        },
      }}
    >
      <Stack
        className="no-print"
        direction="row"
        spacing={1}
        sx={{ mb: 3, justifyContent: 'flex-end' }}
      >
        <Button onClick={() => navigate(-1)}>Назад</Button>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
          Печать
        </Button>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', mb: 2 }}>
        {/* Логотип всегда светлый: документ печатается на белой бумаге. */}
        <Logo height={48} dark={false} />
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: 12 }}>{settings?.phone}</Typography>
          <Typography sx={{ fontSize: 12 }}>{settings?.email}</Typography>
        </Box>
      </Stack>

      <Box sx={{ borderTop: '2px solid #00533B', mb: 2 }} />

      <Typography sx={{ fontSize: 20, fontWeight: 700, mb: 0.5 }}>
        {TITLES[kind as PrintKind](order)}
      </Typography>
      <Typography sx={{ fontSize: 12, color: '#666', mb: 3 }}>
        от {formatDate(order.order_date)}
        {order.delivery_date ? ` · доставка ${formatDate(order.delivery_date)}` : ''}
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mb: 3 }}>
        <Requisites
          title={isInvoice ? 'Поставщик (получатель платежа)' : 'Поставщик'}
          name={organization?.name ?? settings?.legal_name ?? settings?.company_name ?? 'QoQo'}
          bin={(organization?.bin as string) ?? null}
          address={(organization?.address as string) ?? settings?.address}
          phone={(organization?.phone as string) ?? settings?.phone}
        />
        <Requisites
          title={isInvoice ? 'Покупатель (плательщик)' : 'Покупатель'}
          name={order.counterparty_name}
          bin={(counterparty?.bin_iin as string) ?? null}
          address={order.delivery_address ?? (counterparty?.address as string)}
          phone={(counterparty?.phone as string) ?? null}
        />
      </Stack>

      {(order.outlet_name || order.warehouse_name || order.contract_name) && (
        <Stack sx={{ mb: 2, gap: 0.25 }}>
          {order.outlet_name && (
            <Typography sx={{ fontSize: 12 }}>
              Торговая точка: {order.outlet_name}
              {order.outlet_type_name ? ` (${order.outlet_type_name})` : ''}
            </Typography>
          )}
          {isWaybill && order.warehouse_name && (
            <Typography sx={{ fontSize: 12 }}>Склад отгрузки: {order.warehouse_name}</Typography>
          )}
          {order.contract_name && (
            <Typography sx={{ fontSize: 12 }}>Договор: {order.contract_name}</Typography>
          )}
        </Stack>
      )}

      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          '& th, & td': { border: '1px solid #999', padding: '6px 8px' },
          '& th': { background: '#F2F5F2', fontWeight: 700, textAlign: 'left' },
          '& td.num, & th.num': { textAlign: 'right', whiteSpace: 'nowrap' },
        }}
      >
        <thead>
          <tr>
            <th style={{ width: 36 }}>№</th>
            <th>Наименование</th>
            <th className="num" style={{ width: 90 }}>
              Кол-во
            </th>
            <th style={{ width: 60 }}>Ед.</th>
            <th className="num" style={{ width: 110 }}>
              Цена
            </th>
            <th className="num" style={{ width: 120 }}>
              Сумма
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.line.id}>
              <td>{index + 1}</td>
              <td>{row.line.nomenclature_name}</td>
              <td className="num">{formatQuantity(row.quantity)}</td>
              <td>{row.line.unit_name ?? 'кг'}</td>
              <td className="num">{formatSum(row.line.price)}</td>
              <td className="num">{formatSum(row.amount)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>
              Итого
            </td>
            <td className="num" style={{ fontWeight: 700 }}>
              {formatSum(total)}
            </td>
          </tr>
        </tbody>
      </Box>

      <Typography sx={{ mt: 2, fontSize: 13 }}>
        Всего наименований {rows.length}, на сумму {formatSum(total)} ₸
      </Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{amountInWords(total)}</Typography>

      {isInvoice && (
        <Typography sx={{ mt: 2, fontSize: 12, color: '#666' }}>
          Оплата настоящего счёта означает согласие с условиями поставки.
        </Typography>
      )}

      {order.comment && (
        <Typography sx={{ mt: 2, fontSize: 12 }}>Комментарий: {order.comment}</Typography>
      )}

      <Stack direction="row" spacing={6} sx={{ mt: 6, flexWrap: 'wrap', gap: 4 }}>
        <Box sx={{ minWidth: 260 }}>
          <Box sx={{ borderBottom: '1px solid #000', height: 28 }} />
          <Typography sx={{ fontSize: 11, color: '#666' }}>
            {isWaybill ? 'Отпустил' : 'Руководитель'}
          </Typography>
        </Box>
        <Box sx={{ minWidth: 260 }}>
          <Box sx={{ borderBottom: '1px solid #000', height: 28 }} />
          <Typography sx={{ fontSize: 11, color: '#666' }}>
            {isWaybill ? 'Получил' : 'Бухгалтер'}
          </Typography>
        </Box>
      </Stack>

      <Typography sx={{ mt: 4, fontSize: 10, color: '#999' }}>
        Оформил: {order.author_name} · Документ сформирован в системе {settings?.company_name ?? 'QoQo'}
      </Typography>
    </Box>
  )
}
