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
import { LanguageSwitch, ThemeToggle } from '../../components/Preferences'
import { useAuth } from '../../auth/AuthContext'
import { useT } from '../../i18n'
import type { UserRole } from '../../api/types'
import { brand } from '../../theme'

interface InvitationInfo {
  email: string
  full_name: string
  role: UserRole
  expires_at: string
}

const MIN_PASSWORD_LENGTH = 8

export function SetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { setToken } = useAuth()
  const t = useT()

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
      setError(errorMessage(err, t.setPassword.failed))
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
            <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
              <LanguageSwitch />
              <ThemeToggle />
            </Stack>

            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Logo height={56} />
            </Box>

            {!token && (
              <Alert severity="error">{t.setPassword.noToken}</Alert>
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
                  {t.setPassword.toLogin}
                </Button>
              </Stack>
            )}

            {invitation.data && (
              <Stack spacing={3} component="form" onSubmit={handleSubmit}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5">{t.setPassword.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {invitation.data.full_name} · {t.roles[invitation.data.role]}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {invitation.data.email}
                  </Typography>
                </Box>

                {error && <Alert severity="error">{error}</Alert>}

                <TextField
                  label={t.setPassword.password}
                  type="password"
                  size="medium"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  error={tooShort}
                  helperText={
                    t.setPassword.minLength(MIN_PASSWORD_LENGTH)
                  }
                  required
                  fullWidth
                />
                <TextField
                  label={t.setPassword.repeat}
                  type="password"
                  size="medium"
                  value={repeat}
                  onChange={(event) => setRepeat(event.target.value)}
                  autoComplete="new-password"
                  error={mismatch}
                  helperText={mismatch ? t.setPassword.mismatch : ' '}
                  required
                  fullWidth
                />

                <Button type="submit" variant="contained" size="large" disabled={!canSubmit} fullWidth>
                  {busy ? t.setPassword.submitting : t.setPassword.submit}
                </Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
