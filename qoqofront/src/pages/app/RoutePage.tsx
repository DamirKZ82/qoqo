import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DirectionsIcon from '@mui/icons-material/Directions'
import LocationOffIcon from '@mui/icons-material/LocationOff'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import PlaceIcon from '@mui/icons-material/Place'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'

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
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'

import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { toDateInput } from '../../lib/format'

type VisitResult = 'planned' | 'order' | 'no_order' | 'closed' | 'refused' | 'skipped'

interface Visit {
  id: string
  result: VisitResult
  result_title: string
  started_at: string | null
  finished_at: string | null
  distance_m: number | null
  is_nearby: boolean | null
  comment: string | null
}

interface PlanItem {
  outlet_id: string
  outlet_name: string
  outlet_address: string | null
  outlet_type: string | null
  counterparty_name: string | null
  latitude: string | null
  longitude: string | null
  route_id: string | null
  route_name: string | null
  sort_order: number
  visit: Visit | null
}

interface DayPlan {
  day: string
  sales_rep_name: string
  items: PlanItem[]
  planned: number
  visited: number
  skipped: number
  left: number
  far_away: number
  max_distance_m: number
}

const RESULTS: { value: VisitResult; label: string }[] = [
  { value: 'order', label: 'Заявка оформлена' },
  { value: 'no_order', label: 'Был, без заявки' },
  { value: 'closed', label: 'Точка закрыта' },
  { value: 'refused', label: 'Отказ' },
  { value: 'skipped', label: 'Пропустил' },
]

/** Координаты из браузера. Требует HTTPS или localhost. */
function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      // Отказ в доступе к геолокации не должен мешать отметиться: визит
      // сохранится, просто без проверки расстояния.
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  })
}

function DistanceChip({ visit, limit }: { visit: Visit; limit: number }) {
  if (visit.is_nearby === null) {
    return <Chip size="small" variant="outlined" icon={<LocationOffIcon />} label="без геометки" />
  }
  if (visit.is_nearby) {
    return (
      <Chip
        size="small"
        color="success"
        icon={<LocationOnIcon />}
        label={`на месте · ${visit.distance_m} м`}
      />
    )
  }
  return (
    <Chip
      size="small"
      color="error"
      icon={<WarningAmberIcon />}
      label={`${visit.distance_m} м от точки (норма ${limit})`}
    />
  )
}

export function RoutePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [day, setDay] = useState(toDateInput(new Date()))
  const [finishing, setFinishing] = useState<{ visitId: string; outlet: string } | null>(null)
  const [result, setResult] = useState<VisitResult>('order')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isPending } = useQuery({
    queryKey: ['field', 'plan', day],
    queryFn: async () => (await api.get<DayPlan>('/field/plan', { params: { day } })).data,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['field'] })

  const checkIn = useMutation({
    mutationFn: async (item: PlanItem) => {
      const position = await currentPosition()
      return api.post('/field/visits', {
        outlet_id: item.outlet_id,
        route_id: item.route_id,
        planned_date: day,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
      })
    },
    onSuccess: refresh,
  })

  const finish = useMutation({
    mutationFn: async () => {
      const position = await currentPosition()
      return api.post(`/field/visits/${finishing!.visitId}/finish`, {
        result,
        comment: comment || null,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
      })
    },
    onSuccess: () => {
      refresh()
      setFinishing(null)
      setComment('')
    },
  })

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Мой маршрут</Typography>
        <Typography color="text.secondary" variant="body2">
          {data?.sales_rep_name ?? user?.full_name}
        </Typography>
      </Box>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <TextField
          type="date"
          label="День"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {data && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Chip label={`план ${data.planned}`} />
            <Chip color="success" label={`посещено ${data.visited}`} />
            <Chip color={data.left > 0 ? 'warning' : 'default'} label={`осталось ${data.left}`} />
            {data.far_away > 0 && (
              <Chip color="error" label={`не на месте ${data.far_away}`} />
            )}
          </Stack>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && data.items.length === 0 && (
        <Alert severity="info">
          На этот день точек нет. Маршрут составляет директор или администратор.
        </Alert>
      )}

      <Stack spacing={1.5}>
        {data?.items.map((item) => {
          const visit = item.visit
          const done = visit && visit.result !== 'planned'
          const started = Boolean(visit?.started_at)

          return (
            <Card key={item.outlet_id} sx={{ opacity: done ? 0.75 : 1 }}>
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 700 }}>{item.outlet_name}</Typography>
                        {item.outlet_type && <Chip size="small" label={item.outlet_type} />}
                        {done && (
                          <Chip
                            size="small"
                            color={visit!.result === 'skipped' ? 'default' : 'success'}
                            icon={<CheckCircleIcon />}
                            label={visit!.result_title}
                          />
                        )}
                      </Stack>
                      {item.counterparty_name && (
                        <Typography variant="body2" color="text.secondary">
                          {item.counterparty_name}
                        </Typography>
                      )}
                      {item.outlet_address && (
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <PlaceIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="body2" color="text.secondary">
                            {item.outlet_address}
                          </Typography>
                        </Stack>
                      )}
                    </Box>
                  </Stack>

                  {visit && started && (
                    <Box>
                      <DistanceChip visit={visit} limit={data!.max_distance_m} />
                    </Box>
                  )}

                  {visit?.comment && (
                    <Typography variant="body2" color="text.secondary">
                      {visit.comment}
                    </Typography>
                  )}

                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {!done && !started && (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<LocationOnIcon />}
                        disabled={checkIn.isPending}
                        onClick={async () => {
                          setError(null)
                          try {
                            await checkIn.mutateAsync(item)
                          } catch (cause) {
                            setError(errorMessage(cause, 'Не удалось отметить визит'))
                          }
                        }}
                      >
                        Я на месте
                      </Button>
                    )}

                    {started && !done && (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => {
                          setResult('order')
                          setFinishing({ visitId: visit!.id, outlet: item.outlet_name })
                        }}
                      >
                        Завершить визит
                      </Button>
                    )}

                    <Button
                      size="small"
                      component={RouterLink}
                      to="/app/orders/new"
                      startIcon={<AddShoppingCartIcon />}
                    >
                      Заявка
                    </Button>

                    {item.latitude && item.longitude && (
                      <Button
                        size="small"
                        startIcon={<DirectionsIcon />}
                        href={`https://2gis.kz/routeSearch/rsType/car/to/${item.longitude},${item.latitude}`}
                        target="_blank"
                        rel="noopener"
                      >
                        Маршрут
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          )
        })}
      </Stack>

      <Dialog open={Boolean(finishing)} onClose={() => setFinishing(null)} fullWidth maxWidth="xs">
        <DialogTitle>{finishing?.outlet}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              label="Результат"
              value={result}
              onChange={(event) => setResult(event.target.value as VisitResult)}
              fullWidth
            >
              {RESULTS.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Комментарий"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFinishing(null)}>Отмена</Button>
          <Button
            variant="contained"
            disabled={finish.isPending}
            onClick={async () => {
              setError(null)
              try {
                await finish.mutateAsync()
              } catch (cause) {
                setError(errorMessage(cause, 'Не удалось завершить визит'))
              }
            }}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
