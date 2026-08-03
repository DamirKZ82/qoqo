import AddCircleIcon from '@mui/icons-material/AddCircle'
import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'

import { useOrders } from '../../api/queries'
import { useAuth } from '../../auth/AuthContext'
import { OrderCard } from '../../components/OrderCard'
import { useT } from '../../i18n'

const STATUS_TABS = [
  '',
  'draft',
  'new',
  'assembling',
  'assembled',
  'shipped',
  'delivered',
  'cancelled',
] as const

const PAGE_SIZE = 30

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const { hasRole } = useAuth()
  const t = useT()

  const { data, isPending } = useOrders(
    {
      status: status || undefined,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    30_000,
  )

  function changeStatus(value: string) {
    setPage(0)
    setSearchParams(value ? { status: value } : {})
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t.orders.title}
        </Typography>
        {hasRole('admin', 'director', 'sales_rep') && (
          <Button
            component={RouterLink}
            to="/app/orders/new"
            variant="contained"
            startIcon={<AddCircleIcon />}
          >
            {t.orders.create}
          </Button>
        )}
      </Stack>

      <Tabs
        value={status}
        onChange={(_, value: string) => changeStatus(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        {STATUS_TABS.map((tab) => (
          <Tab key={tab} value={tab} label={t.statusPlural[tab === '' ? 'all' : tab]} />
        ))}
      </Tabs>

      <TextField
        placeholder={t.orders.searchPlaceholder}
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

      {isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && data.items.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {t.orders.empty}
        </Typography>
      )}

      <Stack spacing={1.5}>
        {data?.items.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </Stack>

      {totalPages > 1 && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
          <Button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
            {t.common.previous}
          </Button>
          <TextField
            select
            size="small"
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
            sx={{ minWidth: 100 }}
          >
            {Array.from({ length: totalPages }, (_, index) => (
              <MenuItem key={index} value={index}>
                {t.common.pageOf(index + 1, totalPages)}
              </MenuItem>
            ))}
          </TextField>
          <Button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((value) => value + 1)}
          >
            {t.common.next}
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
