import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import TelegramIcon from '@mui/icons-material/Telegram'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, errorMessage } from '../api/client'
import { useT } from '../i18n'
import { formatDateTime } from '../lib/format'

interface TelegramStatus {
  configured: boolean
  linked: boolean
  username: string | null
  linked_at: string | null
  bot_username: string | null
}

interface LinkResponse {
  code: string
  deep_link: string | null
  expires_at: string
  bot_username: string | null
}

export function TelegramLink({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<LinkResponse | null>(null)

  const { data: status, isPending } = useQuery({
    queryKey: ['telegram', 'status'],
    queryFn: async () => (await api.get<TelegramStatus>('/telegram/status')).data,
    enabled: open,
  })

  const createLink = useMutation({
    mutationFn: async () => (await api.post<LinkResponse>('/telegram/link')).data,
    onSuccess: (result) => setLink(result),
  })

  const unlink = useMutation({
    mutationFn: async () => api.delete('/telegram/link'),
    onSuccess: () => {
      setLink(null)
      queryClient.invalidateQueries({ queryKey: ['telegram'] })
    },
  })

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TelegramIcon color="primary" />
          <span>{t.telegram.title}</span>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {isPending && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {status && !status.configured && (
            <Alert severity="info">{t.telegram.notConfigured}</Alert>
          )}

          {status?.configured && status.linked && (
            <Stack spacing={2}>
              <Alert severity="success">
                {t.telegram.linked}
                {status.username ? ` — @${status.username}` : ''}
              </Alert>
              {status.linked_at && (
                <Typography variant="body2" color="text.secondary">
                  {t.telegram.linkedAt(formatDateTime(status.linked_at))}
                </Typography>
              )}
              <Button
                color="error"
                startIcon={<LinkOffIcon />}
                onClick={() => run(() => unlink.mutateAsync())}
                disabled={unlink.isPending}
              >
                {t.telegram.unlink}
              </Button>
            </Stack>
          )}

          {status?.configured && !status.linked && !link && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {t.telegram.hint}
              </Typography>
              {status.bot_username && (
                <Chip icon={<TelegramIcon />} label={`@${status.bot_username}`} />
              )}
              <Button
                variant="contained"
                startIcon={<TelegramIcon />}
                onClick={() => run(() => createLink.mutateAsync())}
                disabled={createLink.isPending}
              >
                {t.telegram.connect}
              </Button>
            </Stack>
          )}

          {link && (
            <Stack spacing={2}>
              <Alert severity="info">{t.telegram.openHint}</Alert>

              {link.deep_link && (
                <Button
                  variant="contained"
                  href={link.deep_link}
                  target="_blank"
                  rel="noopener"
                  startIcon={<OpenInNewIcon />}
                >
                  {t.telegram.openBot}
                </Button>
              )}

              {/* Ссылка может открываться на другом устройстве — тогда код
                  вводится в бота вручную командой /start. */}
              <TextField
                label={t.telegram.code}
                value={link.code}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <IconButton
                        size="small"
                        onClick={() => navigator.clipboard.writeText(link.code)}
                        aria-label={t.common.copy}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    ),
                  },
                }}
                helperText={t.telegram.codeHint(formatDateTime(link.expires_at))}
                fullWidth
              />

              <Button
                onClick={() => {
                  setLink(null)
                  queryClient.invalidateQueries({ queryKey: ['telegram'] })
                }}
              >
                {t.telegram.checkLink}
              </Button>
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t.common.close}</Button>
      </DialogActions>
    </Dialog>
  )
}
