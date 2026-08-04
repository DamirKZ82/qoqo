import DeleteIcon from '@mui/icons-material/Delete'
import SaveIcon from '@mui/icons-material/Save'
import SendIcon from '@mui/icons-material/Send'

import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { api, errorMessage } from '../../api/client'
import {
  useChangeOrderStatus,
  useOrder,
  useReference,
  useSaveOrder,
} from '../../api/queries'
import type { Nomenclature, Outlet, ReferenceItem } from '../../api/types'
import { useT } from '../../i18n'
import { formatMoney } from '../../lib/format'
import { useOffline } from '../../offline/OfflineContext'

interface ResolvedPrice {
  nomenclature_id: string
  base_price: string
  discount_percent: string
  price: string
  price_type_name: string | null
  source: string
}

interface LineDraft {
  key: string
  nomenclature_id: string
  name: string
  unit_name: string | null
  quantity: string
  price: string
}

let lineCounter = 0
const nextKey = () => `line-${(lineCounter += 1)}`

export function OrderFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const t = useT()

  const { data: existing } = useOrder(id)
  const saveOrder = useSaveOrder()
  const { online, queueOrder } = useOffline()
  const changeStatus = useChangeOrderStatus()

  const [counterparty, setCounterparty] = useState<ReferenceItem | null>(null)
  const [outlet, setOutlet] = useState<Outlet | null>(null)
  const [contract, setContract] = useState<ReferenceItem | null>(null)
  const [warehouse, setWarehouse] = useState<ReferenceItem | null>(null)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [comment, setComment] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [error, setError] = useState<string | null>(null)

  const { data: counterparties } = useReference<ReferenceItem>('counterparties', { limit: 200 })
  // Точки и договоры сужаем до выбранного контрагента — так их не перепутать.
  const { data: outlets } = useReference<Outlet>(
    'outlets',
    { limit: 200, counterparty_id: counterparty?.id },
    Boolean(counterparty),
  )
  const { data: contracts } = useReference<ReferenceItem>(
    'contracts',
    { limit: 200, counterparty_id: counterparty?.id },
    Boolean(counterparty),
  )
  const { data: warehouses } = useReference<ReferenceItem>('warehouses', { limit: 100 })
  const { data: products } = useReference<Nomenclature>('nomenclature', { limit: 300 })

  // Подтягиваем существующую заявку в форму.
  useEffect(() => {
    if (!existing) return
    setCounterparty({ id: existing.counterparty_id, name: existing.counterparty_name } as ReferenceItem)
    setOutlet(
      existing.outlet_id
        ? ({ id: existing.outlet_id, name: existing.outlet_name ?? '' } as Outlet)
        : null,
    )
    setContract(
      existing.contract_id
        ? ({ id: existing.contract_id, name: existing.contract_name ?? '' } as ReferenceItem)
        : null,
    )
    setWarehouse(
      existing.warehouse_id
        ? ({ id: existing.warehouse_id, name: existing.warehouse_name ?? '' } as ReferenceItem)
        : null,
    )
    setDeliveryDate(existing.delivery_date ?? '')
    setComment(existing.comment ?? '')
    setLines(
      existing.lines.map((line) => ({
        key: nextKey(),
        nomenclature_id: line.nomenclature_id,
        name: line.nomenclature_name,
        unit_name: line.unit_name,
        quantity: String(Number(line.quantity)),
        price: String(Number(line.price)),
      })),
    )
  }, [existing])

  // Цена зависит от договора: тип цен и скидка — его реквизиты. При смене
  // договора пересчитываем строки, иначе в заявке останутся цены прошлого.
  useEffect(() => {
    if (lines.length === 0) return

    let cancelled = false
    void (async () => {
      try {
        const { data } = await api.get<ResolvedPrice[]>('/prices/resolve', {
          params: {
            contract_id: contract?.id,
            nomenclature_ids: lines.map((line) => line.nomenclature_id),
          },
          paramsSerializer: { indexes: null },
        })
        if (cancelled) return
        const byId = new Map(data.map((item) => [item.nomenclature_id, item]))
        setLines((current) =>
          current.map((line) => {
            const resolved = byId.get(line.nomenclature_id)
            return resolved ? { ...line, price: String(Number(resolved.price)) } : line
          }),
        )
      } catch {
        // Не смогли подобрать — оставляем цены как есть, заявку это не ломает.
      }
    })()

    return () => {
      cancelled = true
    }
    // Намеренно следим только за договором: пересчёт при каждом изменении
    // строк затирал бы цену, исправленную вручную.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.id])

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.price || 0), 0),
    [lines],
  )

  function addProduct(product: Nomenclature | null) {
    if (!product) return
    setLines((current) => {
      // Повторный выбор товара не плодит строки, а увеличивает количество.
      const existingLine = current.find((line) => line.nomenclature_id === product.id)
      if (existingLine) {
        return current.map((line) =>
          line.key === existingLine.key
            ? { ...line, quantity: String(Number(line.quantity || 0) + 1) }
            : line,
        )
      }
      return [
        ...current,
        {
          key: nextKey(),
          nomenclature_id: product.id,
          name: product.name,
          unit_name: product.unit_name,
          quantity: '1',
          price: String(Number(product.price)),
        },
      ]
    })
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function buildPayload() {
    return {
      counterparty_id: counterparty?.id,
      outlet_id: outlet?.id ?? null,
      contract_id: contract?.id ?? null,
      warehouse_id: warehouse?.id ?? null,
      delivery_date: deliveryDate || null,
      delivery_address: outlet?.address ?? null,
      comment: comment || null,
      lines: lines.map((line) => ({
        nomenclature_id: line.nomenclature_id,
        quantity: Number(line.quantity || 0),
        price: Number(line.price || 0),
      })),
    }
  }

  async function handleSave(sendToWarehouse: boolean) {
    setError(null)

    if (!counterparty) {
      setError(t.orderForm.needCounterparty)
      return
    }
    if (lines.length === 0) {
      setError(t.orderForm.needLines)
      return
    }
    if (lines.some((line) => Number(line.quantity) <= 0)) {
      setError(t.orderForm.needQuantity)
      return
    }

    try {
      // Без связи заявка уходит в очередь на устройстве. Идентификатор
      // генерируем здесь же: по нему сервер узнает повтор и не создаст дубль,
      // если ответ на отправку потеряется.
      if (!online && !isEdit) {
        await queueOrder({
          id: crypto.randomUUID(),
          payload: buildPayload(),
          submit: sendToWarehouse,
        })
        navigate('/app/orders')
        return
      }

      const saved = await saveOrder.mutateAsync({ id, values: buildPayload() })
      if (sendToWarehouse && saved.status === 'draft') {
        await changeStatus.mutateAsync({ id: saved.id, status: 'new' })
      }
      navigate(`/app/orders/${saved.id}`)
    } catch (err) {
      setError(errorMessage(err, t.orderForm.saveFailed))
    }
  }

  const busy = saveOrder.isPending || changeStatus.isPending

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Typography variant="h4">{isEdit ? t.orderForm.editTitle : t.orderForm.createTitle}</Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Autocomplete
              options={counterparties?.items ?? []}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={counterparty}
              onChange={(_, value) => {
                setCounterparty(value)
                setOutlet(null)
                setContract(null)
              }}
              renderInput={(params) => <TextField {...params} label={t.orderForm.counterparty} required />}
            />

            <Autocomplete
              options={outlets?.items ?? []}
              getOptionLabel={(option) =>
                option.outlet_type_name ? `${option.name} · ${option.outlet_type_name}` : option.name
              }
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={outlet}
              onChange={(_, value) => setOutlet(value)}
              disabled={!counterparty}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t.orderForm.outlet}
                  helperText={counterparty ? (outlet?.address ?? ' ') : t.orderForm.outletHint}
                />
              )}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Autocomplete
                sx={{ flex: 1 }}
                options={contracts?.items ?? []}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={contract}
                onChange={(_, value) => setContract(value)}
                disabled={!counterparty}
                renderInput={(params) => <TextField {...params} label={t.orderForm.contract} />}
              />
              <Autocomplete
                sx={{ flex: 1 }}
                options={warehouses?.items ?? []}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={warehouse}
                onChange={(_, value) => setWarehouse(value)}
                renderInput={(params) => <TextField {...params} label={t.orderForm.warehouse} />}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={t.orderForm.deliveryDate}
                type="date"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: 1 }}
              />
              <TextField
                label={t.orderForm.comment}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                sx={{ flex: 2 }}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t.orderForm.lines}
          </Typography>

          <Autocomplete
            options={products?.items ?? []}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            value={null}
            blurOnSelect
            onChange={(_, value) => addProduct(value)}
            renderInput={(params) => (
              <TextField {...params} label={t.orderForm.addProduct} placeholder={t.orderForm.addProductHint} />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box sx={{ display: 'flex', width: '100%', gap: 1 }}>
                  <Box sx={{ flexGrow: 1 }}>{option.name}</Box>
                  <Box sx={{ color: 'text.secondary' }}>{formatMoney(option.price)}</Box>
                </Box>
              </li>
            )}
          />

          <Stack spacing={1.5} sx={{ mt: 2 }}>
            {lines.map((line) => (
              <Box key={line.key}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {line.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {line.unit_name ?? t.common.dash} ·{' '}
                      {formatMoney(Number(line.quantity || 0) * Number(line.price || 0))}
                    </Typography>
                  </Box>
                  <TextField
                    label={t.orderForm.quantity}
                    type="number"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    sx={{ width: 100 }}
                    slotProps={{ htmlInput: { min: 0, step: '0.001' } }}
                  />
                  <TextField
                    label={t.orderForm.price}
                    type="number"
                    value={line.price}
                    onChange={(event) => updateLine(line.key, { price: event.target.value })}
                    sx={{ width: 120 }}
                    slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                  />
                  <IconButton
                    onClick={() => setLines((c) => c.filter((item) => item.key !== line.key))}
                    aria-label={t.orderForm.removeLine}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Stack>
                <Divider sx={{ mt: 1.5 }} />
              </Box>
            ))}

            {lines.length === 0 && (
              <Typography color="text.secondary" variant="body2">
                {t.orderForm.noLines}
              </Typography>
            )}
          </Stack>

          <Stack direction="row" sx={{ mt: 2, justifyContent: 'space-between' }}>
            <Typography variant="h6">{t.common.total}</Typography>
            <Typography variant="h6" color="primary">
              {formatMoney(total)}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button
          variant="contained"
          size="large"
          startIcon={<SendIcon />}
          onClick={() => handleSave(true)}
          disabled={busy}
        >
          {t.orderForm.send}
        </Button>
        <Button
          variant="outlined"
          size="large"
          startIcon={<SaveIcon />}
          onClick={() => handleSave(false)}
          disabled={busy}
        >
          {t.orderForm.saveDraft}
        </Button>
        <Button size="large" onClick={() => navigate(-1)} disabled={busy}>
          {t.common.cancel}
        </Button>
      </Stack>
    </Stack>
  )
}
