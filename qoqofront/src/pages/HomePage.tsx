import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useHealth } from '../api/health'

export function HomePage() {
  const { data, isPending, isError, error } = useHealth()

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1" gutterBottom>
          qoqo
        </Typography>
        <Typography color="text.secondary">
          Каркас приложения: FastAPI на бэкенде, React + Material UI на фронтенде.
        </Typography>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h2" gutterBottom>
            Состояние API
          </Typography>

          {isPending && <CircularProgress size={24} />}

          {isError && (
            <Alert severity="error">
              Не удалось связаться с API. Запущен ли бэкенд на localhost:8000?
              <br />
              {error instanceof Error ? error.message : null}
            </Alert>
          )}

          {data && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip color="success" label={`status: ${data.status}`} />
              <Chip label={`app: ${data.app}`} />
              <Chip label={`version: ${data.version}`} />
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  )
}
