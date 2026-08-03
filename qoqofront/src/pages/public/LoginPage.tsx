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
import { useAuth } from '../../auth/AuthContext'
import { brand } from '../../theme'

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
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
      setError(errorMessage(err, 'Не удалось войти'))
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
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Logo height={56} />
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5">Вход для сотрудников</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Система учёта продаж
              </Typography>
            </Box>

            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Рабочая почта"
              type="email"
              size="medium"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              fullWidth
            />
            <TextField
              label="Пароль"
              type="password"
              size="medium"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              fullWidth
            />

            <Button type="submit" variant="contained" size="large" disabled={busy} fullWidth>
              {busy ? 'Входим…' : 'Войти'}
            </Button>

            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              Учётные записи заводит администратор. Если доступа нет — обратитесь к нему за
              приглашением.
            </Typography>

            <Link component={RouterLink} to="/" sx={{ textAlign: 'center' }} underline="hover">
              Вернуться на сайт
            </Link>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
