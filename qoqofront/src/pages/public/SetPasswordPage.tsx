import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'

import { api, errorMessage } from '../../api/client'
import { Logo } from '../../components/Logo'
import { useAuth } from '../../auth/AuthContext'
import { brand } from '../../theme'

interface InvitationInfo {
  email: string
  full_name: string
  role_title: string
  expires_at: string
}

const MIN_PASSWORD_LENGTH = 8

export function SetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { setToken } = useAuth()

  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const invitation = useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => (await api.get<InvitationInfo>(`/auth/invitations/${token}`)).data,
    enabled: Boolean(token),
    retry: false,
  })

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const mismatch = repeat.length > 0 && password !== repeat
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && password === repeat && !busy

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return

    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post<{ access_token: string }>(`/auth/invitations/${token}`, {
        password,
      })
      setToken(data.access_token)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Не удалось установить пароль'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        background: `linear-gradient(160deg, ${brand.green} 0%, ${brand.greenDark} 100%)`,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 440, borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Logo height={56} />
            </Box>

            {!token && (
              <Alert severity="error">
                В ссылке нет токена. Откройте её целиком из письма или запросите новую у
                администратора.
              </Alert>
            )}

            {token && invitation.isPending && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress />
              </Box>
            )}

            {token && invitation.isError && (
              <Stack spacing={2}>
                <Alert severity="error">{errorMessage(invitation.error)}</Alert>
                <Button component={RouterLink} to="/login" variant="outlined">
                  На страницу входа
                </Button>
              </Stack>
            )}

            {invitation.data && (
              <Stack spacing={3} component="form" onSubmit={handleSubmit}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5">Установка пароля</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {invitation.data.full_name} · {invitation.data.role_title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {invitation.data.email}
                  </Typography>
                </Box>

                {error && <Alert severity="error">{error}</Alert>}

                <TextField
                  label="Новый пароль"
                  type="password"
                  size="medium"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  error={tooShort}
                  helperText={
                    tooShort ? `Минимум ${MIN_PASSWORD_LENGTH} символов` : 'Минимум 8 символов'
                  }
                  required
                  fullWidth
                />
                <TextField
                  label="Повторите пароль"
                  type="password"
                  size="medium"
                  value={repeat}
                  onChange={(event) => setRepeat(event.target.value)}
                  autoComplete="new-password"
                  error={mismatch}
                  helperText={mismatch ? 'Пароли не совпадают' : ' '}
                  required
                  fullWidth
                />

                <Button type="submit" variant="contained" size="large" disabled={!canSubmit} fullWidth>
                  {busy ? 'Сохраняем…' : 'Сохранить и войти'}
                </Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
