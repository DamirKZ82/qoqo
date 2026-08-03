import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="h1">404</Typography>
      <Typography color="text.secondary">Такой страницы нет.</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        На главную
      </Button>
    </Stack>
  )
}
