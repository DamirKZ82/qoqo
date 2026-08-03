import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import { AuthProvider } from './auth/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LanguageProvider } from './i18n'
import { installGlobalErrorReporting } from './lib/errorReporter'
import { queryClient } from './lib/queryClient'
import { router } from './router'
import { theme } from './theme'

// Перехватчики ставим один раз при загрузке модуля, до первого рендера.
installGlobalErrorReporting()

export default function App() {
  return (
    // Тему по умолчанию подсказывает операционная система, дальше решает
    // переключатель — выбор MUI запоминает сам.
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      {/* Граница ошибок снаружи провайдеров: если упадёт любой из них,
          пользователь увидит сообщение, а не пустой экран. */}
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <LanguageProvider>
              <RouterProvider router={router} />
            </LanguageProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
