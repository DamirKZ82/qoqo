import AddIcon from '@mui/icons-material/Add'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import EditIcon from '@mui/icons-material/Edit'
import MailIcon from '@mui/icons-material/Mail'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
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
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, errorMessage } from '../../api/client'
import { useReference } from '../../api/queries'
import type { CurrentUser, Page, ReferenceItem, UserRole } from '../../api/types'
import { useT } from '../../i18n'

const ROLES: UserRole[] = ['admin', 'director', 'accountant', 'sales_rep', 'warehouse']

interface InviteResult {
  user: CurrentUser
  invitation_sent: boolean
  invitation_link: string | null
}

const EMPTY_FORM = {
  email: '',
  full_name: '',
  phone: '',
  role: 'sales_rep' as UserRole,
  is_active: true,
  warehouse_id: '',
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const t = useT()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<InviteResult | null>(null)

  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      (await api.get<Page<CurrentUser>>('/users', { params: { only_active: false, limit: 200 } }))
        .data,
  })
  const { data: warehouses } = useReference<ReferenceItem>('warehouses', { limit: 100 })

  const saveUser = useMutation({
    mutationFn: async () => {
      const payload = {
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        role: form.role,
        is_active: form.is_active,
        warehouse_id: form.warehouse_id || null,
      }
      if (editingId) {
        await api.put(`/users/${editingId}`, payload)
        return null
      }
      return (await api.post<InviteResult>('/users', payload)).data
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDialogOpen(false)
      if (result) setInvite(result)
    },
  })

  const resendInvite = useMutation({
    mutationFn: async (userId: string) =>
      (await api.post<InviteResult>(`/users/${userId}/invite`)).data,
    onSuccess: (result) => setInvite(result),
  })

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(user: CurrentUser) {
    setEditingId(user.id)
    setForm({
      email: user.email,
      full_name: user.full_name,
      phone: user.phone ?? '',
      role: user.role,
      is_active: user.is_active,
      warehouse_id: user.warehouse_id ?? '',
    })
    setError(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    setError(null)
    try {
      await saveUser.mutateAsync()
    } catch (err) {
      setError(errorMessage(err, t.users.saveFailed))
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">{t.users.title}</Typography>
          <Typography color="text.secondary" variant="body2">
            {t.users.subtitle}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          {t.users.invite}
        </Button>
      </Stack>

      <Card>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t.users.columns.user}</TableCell>
                <TableCell>{t.users.columns.email}</TableCell>
                <TableCell>{t.users.columns.role}</TableCell>
                <TableCell>{t.users.columns.status}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.items.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>{user.full_name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{t.roles[user.role]}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={user.is_active ? t.users.active : t.users.disabled}
                      color={user.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title={t.users.resend}>
                      <IconButton
                        size="small"
                        onClick={() => resendInvite.mutate(user.id)}
                        disabled={resendInvite.isPending}
                      >
                        <MailIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <IconButton size="small" onClick={() => openEdit(user)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Форма сотрудника */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? t.users.editTitle : t.users.createTitle}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {!editingId && (
              <Alert severity="info">{t.users.mailHint}</Alert>
            )}

            <TextField
              label={t.users.fullName}
              value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              required
              fullWidth
            />
            <TextField
              label={t.users.email}
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
              fullWidth
            />
            <TextField
              label={t.users.phone}
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              fullWidth
            />
            <TextField
              select
              label={t.users.role}
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
              helperText={t.roleHints[form.role]}
              fullWidth
            >
              {ROLES.map((role) => (
                <MenuItem key={role} value={role}>
                  {t.roles[role]}
                </MenuItem>
              ))}
            </TextField>

            {form.role === 'warehouse' && (
              <TextField
                select
                label={t.users.warehouse}
                value={form.warehouse_id}
                onChange={(event) => setForm({ ...form, warehouse_id: event.target.value })}
                helperText={t.users.warehouseHint}
                fullWidth
              >
                <MenuItem value="">{t.users.allWarehouses}</MenuItem>
                {warehouses?.items.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={form.is_active}
                  onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                />
              }
              label={t.users.isActive}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>{t.common.cancel}</Button>
          <Button variant="contained" onClick={handleSave} disabled={saveUser.isPending}>
            {editingId ? t.common.save : t.users.invite}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Результат приглашения */}
      <Dialog open={Boolean(invite)} onClose={() => setInvite(null)} fullWidth maxWidth="sm">
        <DialogTitle>{t.users.inviteTitle}</DialogTitle>
        <DialogContent>
          {invite?.invitation_sent ? (
            <Alert severity="success">{t.users.mailSent(invite.user.email)}</Alert>
          ) : (
            <Stack spacing={2}>
              <Alert severity="warning">{t.users.mailNotConfigured}</Alert>
              <TextField
                label={t.users.inviteLink}
                value={invite?.invitation_link ?? ''}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <IconButton
                        onClick={() =>
                          navigator.clipboard.writeText(invite?.invitation_link ?? '')
                        }
                        aria-label={t.common.copy}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    ),
                  },
                }}
                multiline
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" onClick={() => setInvite(null)}>
            {t.common.understood}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
