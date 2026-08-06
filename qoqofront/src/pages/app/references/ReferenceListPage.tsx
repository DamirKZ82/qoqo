import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import PhotoIcon from '@mui/icons-material/Photo'
import SearchIcon from '@mui/icons-material/Search'
import StorefrontIcon from '@mui/icons-material/Storefront'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
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
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'

import { api, errorMessage, mediaUrl } from '../../../api/client'
import { useReference, useSaveReference } from '../../../api/queries'
import type { ImageUploaded, OkeiUnit, ReferenceItem } from '../../../api/types'
import { useAuth } from '../../../auth/AuthContext'
import { useT, type Dictionary } from '../../../i18n'
import { formatDate } from '../../../lib/format'
import { buildReferences, findReference, type FieldConfig } from './config'

/** Выпадающий список значений другого справочника. */
function RefSelect({
  field,
  value,
  onChange,
}: {
  field: FieldConfig
  value: string
  onChange: (value: string) => void
}) {
  const t = useT()
  const { data } = useReference<ReferenceItem>(field.refResource!, {
    limit: 300,
    ...field.refParams,
  })
  return (
    <TextField
      select
      label={field.label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={field.required}
      fullWidth
    >
      <MenuItem value="">{t.common.notSelected}</MenuItem>
      {data?.items.map((item) => (
        <MenuItem key={item.id} value={item.id}>
          {item.name}
        </MenuItem>
      ))}
    </TextField>
  )
}


/** Подбор единицы из ОКЕИ.
 *
 * Заполняет сразу четыре поля: код, наименование, полное наименование и код по
 * ОКЕИ. Смысл классификатора в том, чтобы человек не набирал их руками и не
 * разошёлся с 1С в коде — там единица сопоставляется именно по нему.
 */
function OkeiPicker({ onPick }: { onPick: (unit: OkeiUnit) => void }) {
  const t = useT()
  const [query, setQuery] = useState('')

  const { data } = useQuery({
    queryKey: ['classifiers', 'okei', query],
    queryFn: async () =>
      (await api.get<OkeiUnit[]>('/classifiers/okei', { params: { search: query || undefined } }))
        .data,
  })

  return (
    <Autocomplete
      options={data ?? []}
      // Отбор делает сервер — по коду, обозначению и названию. Свой фильтр MUI
      // применил бы поверх, сверяя запрос с подписью «166 — Килограмм», и
      // «кг» не нашлось бы в ней ни разу: верное совпадение просто исчезло бы.
      filterOptions={(options) => options}
      groupBy={(option) => option.group}
      getOptionLabel={(option) => `${option.code} — ${option.name}`}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      // Значение не храним: подбор — действие, а не поле. Выбрали — заполнили
      // остальные поля и поле подбора снова пустое.
      value={null}
      onChange={(_, option) => option && onPick(option)}
      inputValue={query}
      onInputChange={(_, value) => setQuery(value)}
      noOptionsText={t.common.nothingFound}
      renderOption={(props, option) => (
        <li {...props} key={option.code}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
            <Typography sx={{ fontWeight: 600, minWidth: 44 }}>{option.code}</Typography>
            <Typography>{option.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {option.symbol}
            </Typography>
          </Stack>
        </li>
      )}
      renderInput={(params) => (
        <TextField {...params} label={t.fields.okeiPick} helperText={t.fields.okeiPickHint} />
      )}
      fullWidth
    />
  )
}


/** Фотография записи: показ, замена, подсказка о порядке действий. */
function ImageField({
  label,
  url,
  disabled,
  onUpload,
}: {
  label: string
  url: string | null
  disabled?: boolean
  onUpload: (file: File) => Promise<void>
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 0.5 }}>
        <Box
          sx={{
            width: 96,
            height: 72,
            borderRadius: 1,
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {url ? (
            <Box
              component="img"
              src={mediaUrl(url)}
              alt={label}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <PhotoIcon color="disabled" />
          )}
        </Box>

        <Box>
          <Button size="small" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
            {url ? t.settings.replace : t.settings.upload}
          </Button>
          {disabled && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t.references.saveFirst}
            </Typography>
          )}
          {error && (
            <Typography
              variant="caption"
              color="error"
              sx={{ display: 'block', maxWidth: 460, mt: 0.5 }}
            >
              {error}
            </Typography>
          )}
        </Box>
      </Stack>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          setBusy(true)
          setError(null)
          try {
            await onUpload(file)
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      />
    </Box>
  )
}

function displayValue(item: ReferenceItem, field: FieldConfig, t: Dictionary): string {
  const raw = item[field.name]
  if (raw === null || raw === undefined || raw === '') return t.common.dash
  if (field.type === 'checkbox') return raw ? t.common.yes : t.common.no
  if (field.type === 'date') return formatDate(String(raw))
  // Для ссылочных полей бэкенд отдаёт готовое имя рядом с идентификатором.
  if (field.type === 'ref') {
    const nameKey = field.name.replace(/_id$/, '_name')
    return item[nameKey] ? String(item[nameKey]) : t.common.dash
  }
  return String(raw)
}

/** Ячейка списка. Ссылку показываем ссылкой: её открывают, а не читают. */
function renderCell(item: ReferenceItem, field: FieldConfig, t: Dictionary) {
  const raw = item[field.name]
  if (field.type === 'url' && raw) {
    return (
      <Link
        href={String(raw)}
        target="_blank"
        // noopener — иначе открытая страница получает доступ к window.opener
        // и может подменить нашу вкладку.
        rel="noopener noreferrer"
        sx={{ display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}
      >
        {String(raw).replace(/^https?:\/\//, '')}
      </Link>
    )
  }
  return displayValue(item, field, t)
}

export function ReferenceListPage() {
  const { resource = '' } = useParams<{ resource: string }>()
  const t = useT()
  const config = findReference(buildReferences(t), resource)
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin', 'director', 'accountant')

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<ReferenceItem | null>(null)
  // Кто не может править, тот всё равно должен видеть карточку целиком:
  // торговому нужны адрес, телефон и ссылка на 2ГИС, а не право на запись.
  const [viewing, setViewing] = useState<ReferenceItem | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [error, setError] = useState<string | null>(null)

  const { data, isPending } = useReference<ReferenceItem>(
    resource,
    { search: search || undefined, limit: 100 },
    Boolean(config),
  )
  const save = useSaveReference(resource)

  if (!config) {
    return <Alert severity="error">{t.references.unknown(resource)}</Alert>
  }

  const listFields = config.fields.filter((field) => field.inList)

  function openDialog(item: ReferenceItem | null) {
    setError(null)
    setEditing(item ?? ({ id: '', name: '' } as ReferenceItem))
    setValues(
      item
        ? Object.fromEntries(config!.fields.map((field) => [field.name, item[field.name] ?? '']))
        : Object.fromEntries(
            config!.fields.map((field) => [field.name, field.type === 'checkbox' ? true : '']),
          ),
    )
  }

  async function handleSave() {
    setError(null)
    const payload: Record<string, unknown> = { is_active: true }

    for (const field of config!.fields) {
      // Подбор — действие, а не реквизит: отправлять его нечего.
      if (field.type === 'okei') continue

      const raw = values[field.name]
      if (field.type === 'checkbox') {
        payload[field.name] = Boolean(raw)
      } else if (raw === '' || raw === undefined) {
        // Пустое число не отправляем вовсе, а не как null: у одних полей на
        // сервере ноль по умолчанию, у других — «не задано», и решать это
        // должен сервер. Прежде летел null, и «Порядок», оставленный пустым,
        // ронял сохранение с невнятным «Input should be a valid integer».
        if (field.type !== 'number') payload[field.name] = null
      } else if (field.type === 'number') {
        payload[field.name] = Number(raw)
      } else {
        payload[field.name] = raw
      }
    }

    try {
      await save.mutateAsync({ id: editing?.id || undefined, values: payload })
      setEditing(null)
    } catch (err) {
      setError(errorMessage(err, t.references.saveFailed))
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">{config.title}</Typography>
          {config.description && (
            <Typography color="text.secondary" variant="body2">
              {config.description}
            </Typography>
          )}
        </Box>
        <Button component={RouterLink} to="/app/refs">
          {t.references.all}
        </Button>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openDialog(null)}>
            {t.common.add}
          </Button>
        )}
      </Stack>

      <TextField
        placeholder={t.references.searchPlaceholder}
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

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {listFields.map((field) => (
                    <TableCell key={field.name}>{field.label}</TableCell>
                  ))}
                  {canEdit && <TableCell align="right" />}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow
                    key={item.id}
                    hover
                    onClick={() => (canEdit ? openDialog(item) : setViewing(item))}
                    sx={{ cursor: 'pointer' }}
                  >
                    {listFields.map((field) => (
                      <TableCell key={field.name}>{renderCell(item, field, t)}</TableCell>
                    ))}
                    {canEdit && (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            // Иначе сработает и нажатие на строку.
                            event.stopPropagation()
                            openDialog(item)
                          }}
                          aria-label={t.common.edit}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={listFields.length + 1}>
                      <Typography color="text.secondary" sx={{ py: 2 }}>
                        {t.common.nothingFound}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
            {t.references.shown(data.items.length, data.total)}
          </Typography>
        </Card>
      )}

      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{viewing?.name ?? config.singular}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {viewing &&
              config.fields
                .filter((field) => viewing[field.name] !== null && viewing[field.name] !== '')
                .map((field) => (
                  <Box key={field.name}>
                    <Typography variant="caption" color="text.secondary">
                      {field.label}
                    </Typography>
                    <Typography component="div">{renderCell(viewing, field, t)}</Typography>
                  </Box>
                ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {viewing?.dgis_url ? (
            <Button
              startIcon={<StorefrontIcon />}
              href={String(viewing.dgis_url)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ mr: 'auto' }}
            >
              {t.references.openInDgis}
            </Button>
          ) : null}
          <Button onClick={() => setViewing(null)}>{t.common.close}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {editing?.id
            ? t.references.editTitle(config.singular)
            : t.references.addTitle(config.singular)}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            {config.fields.map((field) => {
              const value = values[field.name]

              if (field.type === 'okei') {
                return (
                  <OkeiPicker
                    key={field.name}
                    onPick={(unit) =>
                      setValues((current) => ({
                        ...current,
                        code: unit.code,
                        name: unit.symbol,
                        full_name: unit.name,
                        okei_code: unit.code,
                      }))
                    }
                  />
                )
              }

              if (field.type === 'image') {
                return (
                  <ImageField
                    key={field.name}
                    label={field.label}
                    url={value ? String(value) : null}
                    // Фотографию отправляем сразу, не дожидаясь «Сохранить»:
                    // файл нельзя положить в тело обычного JSON, а заводить
                    // ради него черновик записи — лишняя сущность.
                    disabled={!editing?.id}
                    onUpload={async (file) => {
                      const body = new FormData()
                      body.append('file', file)
                      const { data } = await api.post<ImageUploaded>(
                        `/catalog/${editing?.id}/image`,
                        body,
                      )
                      setValues((current) => ({ ...current, image_url: data.product.image_url }))
                      // Загрузка прошла — но увидит ли фотографию посетитель,
                      // знает только сервер: он и проверяет её доступность.
                      if (!data.visible) throw new Error(data.detail)
                    }}
                  />
                )
              }

              if (field.type === 'multiline') {
                return (
                  <TextField
                    key={field.name}
                    label={field.label}
                    value={value ?? ''}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    helperText={field.helperText}
                    multiline
                    minRows={3}
                    fullWidth
                  />
                )
              }

              if (field.type === 'ref') {
                return (
                  <RefSelect
                    key={field.name}
                    field={field}
                    value={value ? String(value) : ''}
                    onChange={(next) =>
                      setValues((current) => ({ ...current, [field.name]: next }))
                    }
                  />
                )
              }

              if (field.type === 'checkbox') {
                return (
                  <FormControlLabel
                    key={field.name}
                    control={
                      <Checkbox
                        checked={Boolean(value)}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.checked,
                          }))
                        }
                      />
                    }
                    label={field.label}
                  />
                )
              }

              return (
                <TextField
                  key={field.name}
                  label={field.label}
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'color' ? 'color' : field.type === 'url' ? 'url' : 'text'}
                  value={value ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                  required={field.required}
                  helperText={field.helperText}
                  slotProps={
                    field.type === 'date' || field.type === 'color'
                      ? { inputLabel: { shrink: true } }
                      : undefined
                  }
                  fullWidth
                />
              )
            })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)}>{t.common.cancel}</Button>
          <Button variant="contained" onClick={handleSave} disabled={save.isPending}>
            {t.common.save}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
