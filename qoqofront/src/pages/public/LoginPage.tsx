import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { errorMessage } from '../../api/client'
import { Logo } from '../../components/Logo'
import { LanguageSwitch, ThemeToggle } from '../../components/Preferences'
import { useAuth } from '../../auth/AuthContext'
import { useT } from '../../i18n'
import { brand } from '../../theme'

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/app'} replace />
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(errorMessage(err, t.login.failed))
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
      <Card sx={{ width: '100%', maxWidth: 420, borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={3} component="form" onSubmit={handleSubmit}>
            <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
              <LanguageSwitch />
              <ThemeToggle />
            </Stack>

            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Logo height={56} />
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5">{t.login.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t.login.subtitle}
              </Typography>
            </Box>

            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label={t.login.email}
              type="email"
              size="medium"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              fullWidth
            />
            <TextField
              label={t.login.password}
              type="password"
              size="medium"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              fullWidth
            />

            <Button type="submit" variant="contained" size="large" disabled={busy} fullWidth>
              {busy ? t.login.submitting : t.login.submit}
            </Button>

            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              {t.login.hint}
            </Typography>

            <Link component={RouterLink} to="/" sx={{ textAlign: 'center' }} underline="hover">
              {t.login.backToSite}
            </Link>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
