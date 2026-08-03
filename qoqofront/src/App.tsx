import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import { AuthProvider } from './auth/AuthContext'
import { LanguageProvider } from './i18n'
import { queryClient } from './lib/queryClient'
import { router } from './router'
import { theme } from './theme'

export default function App() {
  return (
    // Тему по умолчанию подсказывает операционная система, дальше решает
    // переключатель — выбор MUI запоминает сам.
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LanguageProvider>
            <RouterProvider router={router} />
          </LanguageProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
