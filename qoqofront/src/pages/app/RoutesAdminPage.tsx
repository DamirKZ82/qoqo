import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import LocationOffIcon from '@mui/icons-material/LocationOff'
import PlaceIcon from '@mui/icons-material/Place'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'

import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
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
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, errorMessage } from '../../api/client'
import { useReference } from '../../api/queries'
import type { Outlet, Page } from '../../api/types'
import { toDateInput } from '../../lib/format'

const WEEKDAYS = [
  { value: 1, short: 'Пн' },
  { value: 2, short: 'Вт' },
  { value: 3, short: 'Ср' },
  { value: 4, short: 'Чт' },
  { value: 5, short: 'Пт' },
  { value: 6, short: 'Сб' },
  { value: 7, short: 'Вс' },
]

interface RouteStop {
  id?: string
  outlet_id: string
  outlet_name: string
  outlet_address: string | null
  outlet_type: string | null
  sort_order: number
  weekdays: number[]
  comment: string | null
}

interface Route {
  id: string
  code: string | null
  name: string
  is_active: boolean
  sales_rep_id: string | null
  sales_rep_name: string | null
  comment: string | null
  stops_count: number
  stops: RouteStop[]
}

interface Employee {
  id: string
  full_name: string
  role: string
}

const EMPTY: Partial<Route> = { name: '', code: '', sales_rep_id: null, comment: '', stops: [] }

function RouteEditor({
  route,
  onClose,
}: {
  route: Partial<Route> | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Partial<Route>>(route ?? EMPTY)
  const [error, setError] = useState<string | null>(null)

  const { data: outlets } = useReference<Outlet>('outlets', { limit: 300 })
  const { data: employees } = useQuery({
    queryKey: ['users', 'reps'],
    queryFn: async () => (await api.get<Page<Employee>>('/users', { params: { limit: 200 } })).data,
  })

  const stops = draft.stops ?? []

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: draft.name,
        code: draft.code || null,
        sales_rep_id: draft.sales_rep_id || null,
        comment: draft.comment || null,
        is_active: draft.is_active ?? true,
        stops: stops.map((stop, index) => ({
          outlet_id: stop.outlet_id,
          sort_order: index,
          weekdays: stop.weekdays,
          comment: stop.comment,
        })),
      }
      return draft.id
        ? api.put(`/field/routes/${draft.id}`, body)
        : api.post('/field/routes', body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field'] })
      onClose()
    },
  })

  function setStops(next: RouteStop[]) {
    setDraft((current) => ({ ...current, stops: next }))
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...stops]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setStops(next)
  }

  function toggleWeekday(index: number, day: number) {
    setStops(
      stops.map((stop, position) =>
        position === index
          ? {
              ...stop,
              weekdays: stop.weekdays.includes(day)
                ? stop.weekdays.filter((value) => value !== day)
                : [...stop.weekdays, day].sort(),
            }
          : stop,
      ),
    )
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{draft.id ? 'Маршрут' : 'Новый маршрут'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Название"
              value={draft.name ?? ''}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
              sx={{ flex: 2 }}
            />
            <TextField
              label="Код"
              value={draft.code ?? ''}
              onChange={(event) => setDraft({ ...draft, code: event.target.value })}
              sx={{ flex: 1 }}
            />
          </Stack>

          <TextField
            select
            label="Торговый представитель"
            value={draft.sales_rep_id ?? ''}
            onChange={(event) => setDraft({ ...draft, sales_rep_id: event.target.value || null })}
            helperText="Маршрут появится в разделе «Мой маршрут» у этого сотрудника"
            fullWidth
          >
            <MenuItem value="">— не назначен —</MenuItem>
            {employees?.items
              .filter((item) => item.role === 'sales_rep')
              .map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.full_name}
                </MenuItem>
              ))}
          </TextField>

          <Divider />

          <Stack direction="row" sx={{ alignItems: 'center' }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Точки маршрута
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Дни не выбраны — точка посещается каждый день
            </Typography>
          </Stack>

          <Autocomplete
            options={outlets?.items ?? []}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            value={null}
            blurOnSelect
            onChange={(_, value) => {
              if (!value || stops.some((stop) => stop.outlet_id === value.id)) return
              setStops([
                ...stops,
                {
                  outlet_id: value.id,
                  outlet_name: value.name,
                  outlet_address: value.address,
                  outlet_type: value.outlet_type_name,
                  sort_order: stops.length,
                  weekdays: [],
                  comment: null,
                },
              ])
            }}
            renderInput={(params) => (
              <TextField {...params} label="Добавить точку" placeholder="Начните вводить название" />
            )}
          />

          {stops.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Точки не добавлены.
            </Typography>
          )}

          {stops.map((stop, index) => (
            <Card key={stop.outlet_id} variant="outlined">
              <CardContent sx={{ pb: 1.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <Typography sx={{ width: 22, color: 'text.secondary', fontWeight: 700 }}>
                    {index + 1}
                  </Typography>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>{stop.outlet_name}</Typography>
                    {stop.outlet_address && (
                      <Typography variant="caption" color="text.secondary">
                        {stop.outlet_address}
                      </Typography>
                    )}
                  </Box>
                  <IconButton size="small" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={index === stops.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => setStops(stops.filter((_, position) => position !== index))}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>

                <ToggleButtonGroup size="small" sx={{ mt: 1, flexWrap: 'wrap' }}>
                  {WEEKDAYS.map((day) => (
                    <ToggleButton
                      key={day.value}
                      value={day.value}
                      selected={stop.weekdays.includes(day.value)}
                      onClick={() => toggleWeekday(index, day.value)}
                    >
                      {day.short}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={save.isPending || !draft.name}
          onClick={async () => {
            setError(null)
            try {
              await save.mutateAsync()
            } catch (cause) {
              setError(errorMessage(cause, 'Не удалось сохранить маршрут'))
            }
          }}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function RoutesTab() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Partial<Route> | null>(null)

  const { data, isPending } = useQuery({
    queryKey: ['field', 'routes'],
    queryFn: async () =>
      (await api.get<Page<Route>>('/field/routes', { params: { limit: 100 } })).data,
  })

  const deactivate = useMutation({
    mutationFn: async (id: string) => api.delete(`/field/routes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field'] }),
  })

  async function openRoute(id: string) {
    const { data: full } = await api.get<Route>(`/field/routes/${id}`)
    setEditing(full)
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography color="text.secondary" variant="body2" sx={{ flexGrow: 1 }}>
          Маршрут задаёт дни недели, а не даты, — переписывать его каждую неделю не нужно.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
          Маршрут
        </Button>
      </Stack>

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && data.items.length === 0 && (
        <Alert severity="info">Маршрутов пока нет.</Alert>
      )}

      {data?.items.map((route) => (
        <Card key={route.id}>
          <CardContent>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="h6">{route.name}</Typography>
                  {route.code && <Chip size="small" label={route.code} />}
                  <Chip size="small" label={`точек ${route.stops_count}`} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {route.sales_rep_name ?? 'Представитель не назначен'}
                </Typography>
              </Box>
              <Button startIcon={<EditIcon />} onClick={() => openRoute(route.id)}>
                Изменить
              </Button>
              <Button color="error" onClick={() => deactivate.mutate(route.id)}>
                Отключить
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ))}

      {editing && <RouteEditor route={editing} onClose={() => setEditing(null)} />}
    </Stack>
  )
}

interface PlanVisit {
  result_title: string
  result: string
  distance_m: number | null
  is_nearby: boolean | null
  comment: string | null
  started_at: string | null
}

interface DayPlan {
  sales_rep_name: string
  planned: number
  visited: number
  skipped: number
  left: number
  far_away: number
  max_distance_m: number
  items: {
    outlet_id: string
    outlet_name: string
    outlet_address: string | null
    visit: PlanVisit | null
  }[]
}

function ControlTab() {
  const [day, setDay] = useState(toDateInput(new Date()))
  const [repId, setRepId] = useState('')

  const { data: employees } = useQuery({
    queryKey: ['users', 'reps'],
    queryFn: async () => (await api.get<Page<Employee>>('/users', { params: { limit: 200 } })).data,
  })

  const reps = employees?.items.filter((item) => item.role === 'sales_rep') ?? []
  const selected = repId || reps[0]?.id || ''

  const { data, isPending } = useQuery({
    queryKey: ['field', 'plan', 'control', selected, day],
    queryFn: async () =>
      (await api.get<DayPlan>('/field/plan', { params: { day, sales_rep_id: selected } })).data,
    enabled: Boolean(selected),
  })

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          label="Представитель"
          value={selected}
          onChange={(event) => setRepId(event.target.value)}
          sx={{ minWidth: 240 }}
        >
          {reps.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.full_name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="date"
          label="День"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && (
        <>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Chip label={`план ${data.planned}`} />
            <Chip color="success" label={`посещено ${data.visited}`} />
            <Chip color={data.left > 0 ? 'warning' : 'default'} label={`осталось ${data.left}`} />
            {data.far_away > 0 && (
              <Chip
                color="error"
                icon={<WarningAmberIcon />}
                label={`отметок не на месте ${data.far_away}`}
              />
            )}
          </Stack>

          {data.items.length === 0 && (
            <Alert severity="info">На этот день у представителя точек нет.</Alert>
          )}

          <Stack spacing={1}>
            {data.items.map((item) => (
              <Card key={item.outlet_id} variant="outlined">
                <CardContent sx={{ py: 1.5 }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <PlaceIcon fontSize="small" color="action" />
                    <Box sx={{ flexGrow: 1, minWidth: 180 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.outlet_name}
                      </Typography>
                      {item.visit?.comment && (
                        <Typography variant="caption" color="text.secondary">
                          {item.visit.comment}
                        </Typography>
                      )}
                    </Box>

                    {!item.visit && <Chip size="small" variant="outlined" label="не был" />}

                    {item.visit && (
                      <>
                        <Chip
                          size="small"
                          color={item.visit.result === 'skipped' ? 'default' : 'success'}
                          label={item.visit.result_title}
                        />
                        {item.visit.is_nearby === null ? (
                          <Tooltip title="Координат нет — проверить нечем">
                            <Chip size="small" variant="outlined" icon={<LocationOffIcon />} label="—" />
                          </Tooltip>
                        ) : (
                          <Chip
                            size="small"
                            color={item.visit.is_nearby ? 'success' : 'error'}
                            label={`${item.visit.distance_m} м`}
                          />
                        )}
                      </>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </>
      )}
    </Stack>
  )
}

export function RoutesAdminPage() {
  const [tab, setTab] = useState(0)

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Маршруты</Typography>
        <Typography color="text.secondary" variant="body2">
          Планы обхода торговых точек и контроль их выполнения.
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(_, value: number) => setTab(value)}>
        <Tab label="Маршруты" />
        <Tab label="Контроль дня" />
      </Tabs>

      {tab === 0 ? <RoutesTab /> : <ControlTab />}
    </Stack>
  )
}
