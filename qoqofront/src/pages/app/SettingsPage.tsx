import DeleteIcon from '@mui/icons-material/Delete'
import SendIcon from '@mui/icons-material/Send'
import UploadIcon from '@mui/icons-material/Upload'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { api, errorMessage, mediaUrl } from '../../api/client'
import { useSettings } from '../../api/queries'
import type { AppSettings, MailSettings } from '../../api/types'
import { Logo } from '../../components/Logo'
import { useT } from '../../i18n'
import logoDarkSrc from '../../assets/logo-dark.svg'
import logoSrc from '../../assets/logo.svg'

type LogoVariant = 'light' | 'dark' | 'favicon'

const VARIANTS: LogoVariant[] = ['light', 'dark', 'favicon']

function LogoSlot({
  variant,
  title,
  hint,
  currentUrl,
  onChanged,
}: {
  variant: LogoVariant
  title: string
  hint: string
  currentUrl: string | null
  onChanged: () => void
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return api.post('/settings/logo', body, { params: { variant } })
    },
    onSuccess: onChanged,
  })

  const reset = useMutation({
    mutationFn: async () => api.delete('/settings/logo', { params: { variant } }),
    onSuccess: onChanged,
  })

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      await upload.mutateAsync(file)
    } catch (err) {
      setError(errorMessage(err, t.settings.uploadFailed))
    } finally {
      // Сбрасываем input, иначе повторный выбор того же файла не сработает.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {hint}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 96,
            p: 2,
            mb: 2,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: variant === 'dark' ? 'primary.main' : 'background.default',
          }}
        >
          <Box
            component="img"
            src={mediaUrl(currentUrl) ?? (variant === 'dark' ? logoDarkSrc : logoSrc)}
            alt={title}
            sx={{ maxHeight: 64, maxWidth: '100%' }}
          />
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
          >
            {currentUrl ? t.settings.replace : t.settings.upload}
          </Button>
          {currentUrl && (
            <Button
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => reset.mutate()}
              disabled={reset.isPending}
            >
              {t.settings.reset}
            </Button>
          )}
        </Stack>

        <input
          ref={inputRef}
          type="file"
          accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
          hidden
          onChange={handleFile}
        />
      </CardContent>
    </Card>
  )
}


/** Настройки почты. Отдельной карточкой: у них своё сохранение и своя проверка. */
function MailCard() {
  const t = useT()
  const [form, setForm] = useState<Record<string, unknown> | null>(null)
  const [password, setPassword] = useState('')
  const [note, setNote] = useState<string | null>(null)

  const { data, refetch } = useQuery({
    queryKey: ['settings', 'mail'],
    queryFn: async () => (await api.get<MailSettings>('/settings/mail')).data,
  })

  // Форму наполняем один раз: иначе перезапрос затирал бы то, что человек
  // печатает прямо сейчас.
  const значения = form ?? (data as unknown as Record<string, unknown>) ?? {}
  const поле = (имя: string) => (значения[имя] as string | number | null) ?? ''
  const правка = (имя: string, значение: unknown) =>
    setForm({ ...(значения as Record<string, unknown>), [имя]: значение })

  const save = useMutation({
    mutationFn: async () =>
      (await api.put<MailSettings>('/settings/mail', { ...значения, smtp_password: password })).data,
    onSuccess: async () => {
      setPassword('')
      setForm(null)
      await refetch()
      setNote(t.settings.mail.saved)
    },
  })

  const test = useMutation({
    mutationFn: async () =>
      (await api.post<{ sent: boolean; detail: string }>('/settings/mail/test')).data,
    onSuccess: (result) => setNote(result.detail),
    onError: (error) => setNote(errorMessage(error)),
  })

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">{t.settings.mail.title}</Typography>
          <Chip
            size="small"
            color={data?.configured ? 'success' : 'default'}
            variant={data?.configured ? 'filled' : 'outlined'}
            label={data?.configured ? t.settings.mail.configured : t.settings.mail.notConfigured}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t.settings.mail.hint}
        </Typography>

        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t.settings.mail.host}
              value={поле('smtp_host')}
              onChange={(e) => правка('smtp_host', e.target.value)}
              placeholder="smtp.yandex.ru"
              fullWidth
            />
            <TextField
              label={t.settings.mail.port}
              type="number"
              value={поле('smtp_port') || 587}
              onChange={(e) => правка('smtp_port', Number(e.target.value))}
              sx={{ minWidth: 120 }}
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t.settings.mail.user}
              value={поле('smtp_user')}
              onChange={(e) => правка('smtp_user', e.target.value)}
              fullWidth
            />
            <TextField
              label={t.settings.mail.password}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText={data?.password_set ? t.settings.mail.passwordKept : undefined}
              autoComplete="new-password"
              fullWidth
            />
          </Stack>

          <TextField
            label={t.settings.mail.from}
            value={поле('smtp_from')}
            onChange={(e) => правка('smtp_from', e.target.value)}
            helperText={t.settings.mail.fromHint}
            fullWidth
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(значения.smtp_use_ssl)}
                  onChange={(e) => правка('smtp_use_ssl', e.target.checked)}
                />
              }
              label={t.settings.mail.useSsl}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(значения.smtp_use_tls)}
                  onChange={(e) => правка('smtp_use_tls', e.target.checked)}
                />
              }
              label={t.settings.mail.useTls}
            />
            <Typography variant="caption" color="text.secondary">
              {t.settings.mail.sslHint}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>
              {t.settings.submit}
            </Button>
            <Button
              startIcon={<SendIcon />}
              onClick={() => test.mutate()}
              disabled={test.isPending || !data?.configured}
            >
              {t.settings.mail.test}
            </Button>
            <Typography variant="caption" color="text.secondary">
              {t.settings.mail.testHint}
            </Typography>
          </Stack>
        </Stack>

        <Snackbar
          open={Boolean(note)}
          autoHideDuration={6000}
          onClose={() => setNote(null)}
          message={note}
        />
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: settings } = useSettings()
  const [form, setForm] = useState<Partial<AppSettings>>({})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['settings'] })

  const save = useMutation({
    mutationFn: async () =>
      api.put('/settings', {
        company_name: form.company_name ?? 'QoQo',
        legal_name: form.legal_name || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        primary_color: form.primary_color ?? '#00533B',
        accent_color: form.accent_color ?? '#D4AF37',
        hero_title: form.hero_title || null,
        hero_subtitle: form.hero_subtitle || null,
      }),
    onSuccess: () => {
      refresh()
      setSaved(true)
    },
  })

  async function handleSave() {
    setError(null)
    try {
      await save.mutateAsync()
    } catch (err) {
      setError(errorMessage(err, t.settings.saveFailed))
    }
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 1000 }}>
      <Box>
        <Typography variant="h4">{t.settings.title}</Typography>
        <Typography color="text.secondary" variant="body2">
          {t.settings.subtitle}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t.settings.preview}
          </Typography>
          <Stack
            direction="row"
            spacing={2}
            sx={{
              alignItems: 'center',
              p: 2,
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Logo height={40} />
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{form.company_name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {form.legal_name}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
        }}
      >
        {VARIANTS.map((variant) => (
          <LogoSlot
            key={variant}
            variant={variant}
            title={t.settings.logos[variant].title}
            hint={t.settings.logos[variant].hint}
            currentUrl={
              variant === 'light'
                ? (settings?.logo_url ?? null)
                : variant === 'dark'
                  ? (settings?.logo_dark_url ?? null)
                  : (settings?.favicon_url ?? null)
            }
            onChanged={refresh}
          />
        ))}
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t.settings.company}
          </Typography>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={t.settings.companyName}
                value={form.company_name ?? ''}
                onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                fullWidth
              />
              <TextField
                label={t.settings.legalName}
                value={form.legal_name ?? ''}
                onChange={(event) => setForm({ ...form, legal_name: event.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={t.settings.phone}
                value={form.phone ?? ''}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                fullWidth
              />
              <TextField
                label={t.settings.email}
                value={form.email ?? ''}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              label={t.settings.address}
              value={form.address ?? ''}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={t.settings.primaryColor}
                type="color"
                value={form.primary_color ?? '#00533B'}
                onChange={(event) => setForm({ ...form, primary_color: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label={t.settings.accentColor}
                type="color"
                value={form.accent_color ?? '#D4AF37'}
                onChange={(event) => setForm({ ...form, accent_color: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <MailCard />

      <Box>
        <Button variant="contained" size="large" onClick={handleSave} disabled={save.isPending}>
          {t.settings.submit}
        </Button>
      </Box>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message={t.settings.saved}
      />
    </Stack>
  )
}
