import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import SearchIcon from '@mui/icons-material/Search'
import Alert from '@mui/material/Alert'
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
import { useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'

import { errorMessage } from '../../../api/client'
import { useReference, useSaveReference } from '../../../api/queries'
import type { ReferenceItem } from '../../../api/types'
import { useAuth } from '../../../auth/AuthContext'
import { formatDate } from '../../../lib/format'
import { findReference, type FieldConfig } from './config'

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
  const { data } = useReference<ReferenceItem>(field.refResource!, { limit: 300 })
  return (
    <TextField
      select
      label={field.label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={field.required}
      fullWidth
    >
      <MenuItem value="">— не выбрано —</MenuItem>
      {data?.items.map((item) => (
        <MenuItem key={item.id} value={item.id}>
          {item.name}
        </MenuItem>
      ))}
    </TextField>
  )
}

function displayValue(item: ReferenceItem, field: FieldConfig): string {
  const raw = item[field.name]
  if (raw === null || raw === undefined || raw === '') return '—'
  if (field.type === 'checkbox') return raw ? 'да' : 'нет'
  if (field.type === 'date') return formatDate(String(raw))
  // Для ссылочных полей бэкенд отдаёт готовое имя рядом с идентификатором.
  if (field.type === 'ref') {
    const nameKey = field.name.replace(/_id$/, '_name')
    return item[nameKey] ? String(item[nameKey]) : '—'
  }
  return String(raw)
}

export function ReferenceListPage() {
  const { resource = '' } = useParams<{ resource: string }>()
  const config = findReference(resource)
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin', 'director', 'accountant')

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<ReferenceItem | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [error, setError] = useState<string | null>(null)

  const { data, isPending } = useReference<ReferenceItem>(
    resource,
    { search: search || undefined, limit: 100 },
    Boolean(config),
  )
  const save = useSaveReference(resource)

  if (!config) {
    return <Alert severity="error">Неизвестный справочник: {resource}</Alert>
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
      const raw = values[field.name]
      if (field.type === 'checkbox') {
        payload[field.name] = Boolean(raw)
      } else if (raw === '' || raw === undefined) {
        // Пустая строка для ссылки и числа означает «не задано».
        payload[field.name] = null
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
      setError(errorMessage(err, 'Не удалось сохранить'))
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
          Все справочники
        </Button>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openDialog(null)}>
            Добавить
          </Button>
        )}
      </Stack>

      <TextField
        placeholder="Поиск по наименованию или коду"
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
                  <TableRow key={item.id} hover>
                    {listFields.map((field) => (
                      <TableCell key={field.name}>{displayValue(item, field)}</TableCell>
                    ))}
                    {canEdit && (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton size="small" onClick={() => openDialog(item)} aria-label="Изменить">
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
                        Ничего не найдено.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
            Показано {data.items.length} из {data.total}
          </Typography>
        </Card>
      )}

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {editing?.id ? `Изменить ${config.singular}` : `Добавить ${config.singular}`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            {config.fields.map((field) => {
              const value = values[field.name]

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
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'color' ? 'color' : 'text'}
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
          <Button onClick={() => setEditing(null)}>Отмена</Button>
          <Button variant="contained" onClick={handleSave} disabled={save.isPending}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
