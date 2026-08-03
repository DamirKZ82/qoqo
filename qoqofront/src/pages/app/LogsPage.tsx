import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SearchIcon from '@mui/icons-material/Search'

import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api } from '../../api/client'
import type { Page } from '../../api/types'
import { formatDateTime } from '../../lib/format'

type LogSource = 'server' | 'client'

interface ErrorLogEntry {
  id: string
  created_at: string
  source: LogSource
  level: 'error' | 'warning'
  message: string
  detail: string | null
  request_id: string | null
  method: string | null
  path: string | null
  status_code: number | null
  user_name: string | null
  user_agent: string | null
  context: Record<string, unknown> | null
}

interface LogStats {
  total: number
  last_24h: number
  server: number
  client: number
}

const SOURCES: { value: string; label: string }[] = [
  { value: '', label: 'Все источники' },
  { value: 'server', label: 'Сервер' },
  { value: 'client', label: 'Браузер' },
]

const PAGE_SIZE = 50

export function LogsPage() {
  const queryClient = useQueryClient()
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const { data, isPending } = useQuery({
    queryKey: ['logs', source, search, page],
    queryFn: async () =>
      (
        await api.get<Page<ErrorLogEntry>>('/logs', {
          params: {
            source: source || undefined,
            search: search || undefined,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          },
        })
      ).data,
    // Журнал пополняется сам — обновляем, пока страница открыта.
    refetchInterval: 30_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['logs', 'stats'],
    queryFn: async () => (await api.get<LogStats>('/logs/stats')).data,
    refetchInterval: 30_000,
  })

  const clear = useMutation({
    mutationFn: async (olderThanDays: number) =>
      api.delete('/logs', { params: { older_than_days: olderThanDays } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs'] }),
  })

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Журнал ошибок</Typography>
        <Typography color="text.secondary" variant="body2">
          Ошибки сервера и браузера. Код запроса из сообщения пользователя ищется здесь же.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        {[
          { label: 'Всего', value: stats?.total },
          { label: 'За сутки', value: stats?.last_24h },
          { label: 'Сервер', value: stats?.server },
          { label: 'Браузер', value: stats?.client },
        ].map((tile) => (
          <Card key={tile.label}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                {tile.label}
              </Typography>
              <Typography variant="h4">{tile.value ?? 0}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          select
          label="Источник"
          value={source}
          onChange={(event) => {
            setSource(event.target.value)
            setPage(0)
          }}
          sx={{ minWidth: 180 }}
        >
          {SOURCES.map((item) => (
            <MenuItem key={item.value} value={item.value}>
              {item.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          placeholder="Текст ошибки, адрес или код запроса"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(0)
          }}
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

        <Button
          color="error"
          startIcon={<DeleteSweepIcon />}
          onClick={() => clear.mutate(30)}
          disabled={clear.isPending}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Старше 30 дней
        </Button>
      </Stack>

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data?.items.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          Ошибок нет.
        </Typography>
      )}

      {data?.items.map((entry) => (
        <Accordion key={entry.id} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack sx={{ width: '100%', minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  color={entry.source === 'server' ? 'error' : 'warning'}
                  label={entry.source === 'server' ? 'Сервер' : 'Браузер'}
                />
                {entry.status_code && <Chip size="small" label={entry.status_code} />}
                <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap>
                  {entry.message}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {formatDateTime(entry.created_at)}
                {entry.path ? ` · ${entry.method ?? ''} ${entry.path}` : ''}
                {entry.user_name ? ` · ${entry.user_name}` : ''}
                {entry.request_id ? ` · код ${entry.request_id}` : ''}
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            {entry.detail ? (
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  fontSize: 12,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {entry.detail}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Подробностей нет.
              </Typography>
            )}

            {entry.context && (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                {Object.entries(entry.context)
                  .map(([key, value]) => `${key}: ${String(value)}`)
                  .join(' · ')}
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>
      ))}

      {totalPages > 1 && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', alignItems: 'center' }}>
          <Button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
            Назад
          </Button>
          <Typography variant="body2">
            {page + 1} из {totalPages}
          </Typography>
          <Button disabled={page >= totalPages - 1} onClick={() => setPage((value) => value + 1)}>
            Вперёд
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
