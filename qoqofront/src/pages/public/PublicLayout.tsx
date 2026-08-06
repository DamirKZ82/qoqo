import LoginIcon from '@mui/icons-material/Login'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'

import { useSettings } from '../../api/queries'
import { Logo } from '../../components/Logo'
import { LanguageSwitch, ThemeToggle } from '../../components/Preferences'
import { useT } from '../../i18n'

/**
 * Обрамление страниц сайта, кроме главной.
 *
 * У главной шапка своя — она прозрачная поверх первого экрана и живёт вместе с
 * её разметкой. Переносить её сюда значило бы перекроить работающую страницу
 * ради двух новых; когда таких страниц станет больше, объединить будет проще.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  const t = useT()
  const { data: settings } = useSettings()

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Container maxWidth="lg" disableGutters>
          <Toolbar sx={{ gap: 2, px: { xs: 2, md: 0 } }}>
            <Box component={RouterLink} to="/" sx={{ display: 'flex' }}>
              <Logo height={40} />
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <Button component={RouterLink} to="/products" size="small">
              {t.products.title}
            </Button>
            <LanguageSwitch />
            <ThemeToggle />
            <Button
              component={RouterLink}
              to="/login"
              size="small"
              variant="contained"
              startIcon={<LoginIcon />}
            >
              {t.landing.login}
            </Button>
          </Toolbar>
        </Container>
      </AppBar>

      <Box sx={{ flexGrow: 1 }}>{children}</Box>

      <Divider />
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ justifyContent: 'space-between' }}
        >
          <Typography variant="body2" color="text.secondary">
            {settings?.company_name ?? 'QoQo'}
            {settings?.legal_name ? ` · ${settings.legal_name}` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {settings?.phone} {settings?.email ? `· ${settings.email}` : ''}
          </Typography>
        </Stack>
      </Container>
    </Box>
  )
}
