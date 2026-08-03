import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { reportError } from '../lib/errorReporter'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Перехватывает ошибки рендера, чтобы вместо белого экрана показать понятное
 * сообщение, и отправляет их в журнал.
 *
 * Тексты здесь на русском без словаря: словарь сам мог оказаться причиной
 * поломки, и обращение к нему из обработчика ошибки уронило бы и его.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError({
      message: error.message || 'Ошибка интерфейса',
      detail: `${error.stack ?? ''}\n\nКомпоненты:${info.componentStack ?? ''}`,
      context: { kind: 'react' },
    })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <Stack spacing={2} sx={{ maxWidth: 560, width: '100%', pt: 6 }}>
          <Typography variant="h5">Что-то пошло не так</Typography>
          <Alert severity="error">{this.state.error.message}</Alert>
          <Typography variant="body2" color="text.secondary">
            Ошибка записана в журнал — администратор её увидит. Попробуйте обновить страницу.
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => window.location.reload()}>
              Обновить
            </Button>
            <Button onClick={() => window.location.assign('/')}>На главную</Button>
          </Stack>
        </Stack>
      </Box>
    )
  }
}
