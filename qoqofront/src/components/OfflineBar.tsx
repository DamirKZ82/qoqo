import CloudDoneIcon from '@mui/icons-material/CloudDone'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useOffline } from '../offline/OfflineContext'
import { formatDateTime } from '../lib/format'

/**
 * Полоса состояния связи.
 *
 * Показывается только когда есть что сказать: при устойчивой связи и пустой
 * очереди она не отвлекает.
 */
export function OfflineBar() {
  const { online, pending, syncedAt, syncing, flush } = useOffline()

  if (online && pending === 0) return null

  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        bgcolor: online ? 'warning.light' : 'grey.800',
        color: online ? 'warning.contrastText' : 'common.white',
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {online ? <CloudUploadIcon fontSize="small" /> : <CloudOffIcon fontSize="small" />}

        <Typography variant="body2" sx={{ flexGrow: 1 }}>
          {online
            ? `Заявок ждут отправки: ${pending}`
            : 'Нет связи. Заявки сохраняются на устройстве и уйдут, когда связь появится.'}
        </Typography>

        {!online && syncedAt && (
          <Chip
            size="small"
            icon={<CloudDoneIcon />}
            label={`справочники от ${formatDateTime(new Date(syncedAt).toISOString())}`}
            sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'inherit' }}
          />
        )}

        {!online && pending > 0 && (
          <Chip size="small" color="warning" label={`в очереди ${pending}`} />
        )}

        {online && pending > 0 && (
          <Button size="small" onClick={() => void flush()} disabled={syncing}>
            Отправить сейчас
          </Button>
        )}
      </Stack>
    </Box>
  )
}
