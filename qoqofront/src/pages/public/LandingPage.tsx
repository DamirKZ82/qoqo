import AcUnitIcon from '@mui/icons-material/AcUnit'
import CallIcon from '@mui/icons-material/Call'
import EcoIcon from '@mui/icons-material/Spa'
import EmailIcon from '@mui/icons-material/Email'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import LoginIcon from '@mui/icons-material/Login'
import MenuIcon from '@mui/icons-material/Menu'
import PlaceIcon from '@mui/icons-material/Place'
import ScheduleIcon from '@mui/icons-material/Schedule'
import VerifiedIcon from '@mui/icons-material/Verified'

import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { useMemo, useState, type ReactElement } from 'react'
import { Link as RouterLink } from 'react-router-dom'

import { mediaUrl } from '../../api/client'
import { useContentBlocks, useNews, useSettings } from '../../api/queries'
import type { ContentBlock } from '../../api/types'
import { Logo } from '../../components/Logo'
import { LanguageSwitch, ThemeToggle } from '../../components/Preferences'
import { useLanguage, useT, type Dictionary } from '../../i18n'
import { localizeBlock, localizePost } from '../../lib/localize'
import { brand } from '../../theme'

function navLinks(t: Dictionary) {
  return [
    { label: t.landing.about, href: '#about' },
    { label: t.landing.catalog, href: '#catalog' },
    { label: t.landing.news, href: '#news' },
    { label: t.landing.contacts, href: '#contacts' },
  ]
}

const FEATURE_ICONS: Record<string, ReactElement> = {
  eco: <EcoIcon />,
  ac_unit: <AcUnitIcon />,
  verified: <VerifiedIcon />,
  local_shipping: <LocalShippingIcon />,
}

/** Достаёт массив из payload блока, не падая на неожиданной структуре. */
function arrayOf<T = Record<string, string>>(
  block: ContentBlock | undefined,
  key = 'items',
): T[] {
  const value = block?.payload?.[key]
  return Array.isArray(value) ? (value as T[]) : []
}

function stringOf(block: ContentBlock | undefined, key: string): string | undefined {
  const value = block?.payload?.[key]
  return typeof value === 'string' && value ? value : undefined
}

export function LandingPage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [menuOpen, setMenuOpen] = useState(false)
  const t = useT()
  const { language } = useLanguage()
  const links = navLinks(t)

  const { data: settings } = useSettings()
  const { data: rawBlocks = [] } = useContentBlocks()
  const { data: rawNews } = useNews({ limit: 3 })

  // Содержимое CMS хранится на языке по умолчанию, перевод накладывается сверху.
  const blocks = useMemo(
    () => rawBlocks.map((item) => localizeBlock(item, language)),
    [rawBlocks, language],
  )
  const news = useMemo(
    () => (rawNews ? { ...rawNews, items: rawNews.items.map((i) => localizePost(i, language)) } : rawNews),
    [rawNews, language],
  )

  const block = (type: string) => blocks.find((item) => item.block_type === type)
  const hero = block('hero')
  const features = block('features')
  const catalog = block('catalog')
  const about = block('about')
  const contacts = block('contacts')

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      <AppBar
        position="sticky"
        sx={{
          bgcolor: 'background.paper',
          backdropFilter: 'blur(8px)',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="lg" disableGutters>
          <Toolbar sx={{ gap: 2, px: { xs: 2, md: 0 } }}>
            <Box component={RouterLink} to="/" sx={{ display: 'flex' }}>
              <Logo height={isMobile ? 32 : 40} />
            </Box>
            <Box sx={{ flexGrow: 1 }} />

            {isMobile ? (
              <>
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
                <IconButton onClick={() => setMenuOpen(true)} aria-label={t.nav.menu}>
                  <MenuIcon />
                </IconButton>
              </>
            ) : (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {links.map((link) => (
                  <Button key={link.href} href={link.href} color="inherit">
                    {link.label}
                  </Button>
                ))}
                <LanguageSwitch />
                <ThemeToggle />
                <Button
                  component={RouterLink}
                  to="/login"
                  variant="contained"
                  startIcon={<LoginIcon />}
                >
                  {t.landing.staffLogin}
                </Button>
              </Stack>
            )}
          </Toolbar>
        </Container>
      </AppBar>

      <Drawer anchor="right" open={menuOpen} onClose={() => setMenuOpen(false)}>
        <Box sx={{ width: 260, pt: 2 }} role="presentation" onClick={() => setMenuOpen(false)}>
          <Box sx={{ px: 2, pb: 2 }}>
            <Logo height={32} />
          </Box>
          <Divider />
          <List>
            {links.map((link) => (
              <ListItemButton key={link.href} component="a" href={link.href}>
                <ListItemText primary={link.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      {/* Первый экран */}
      <Box
        sx={{
          background: `linear-gradient(160deg, ${brand.green} 0%, ${brand.greenDark} 100%)`,
          color: '#fff',
          py: { xs: 6, md: 10 },
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={3} sx={{ maxWidth: 760 }}>
            <Typography variant="h1" sx={{ fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 1.15 }}>
              {hero?.title ?? settings?.hero_title ?? t.landing.heroTitle}
            </Typography>
            <Typography sx={{ color: brand.gold, fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 600 }}>
              {hero?.subtitle ?? settings?.hero_subtitle ?? t.landing.heroSubtitle}
            </Typography>
            {stringOf(hero, 'lead') && (
              <Typography sx={{ opacity: 0.9, fontSize: { xs: '0.95rem', md: '1.1rem' } }}>
                {stringOf(hero, 'lead')}
              </Typography>
            )}

            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
              {arrayOf<{ title: string; subtitle?: string }>(hero, 'badges').map((badge) => (
                <Chip
                  key={badge.title}
                  label={badge.title}
                  sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', border: `1px solid ${brand.gold}` }}
                />
              ))}
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1 }}>
              <Button
                href={stringOf(hero, 'cta_link') ?? '#contacts'}
                size="large"
                variant="contained"
                color="secondary"
              >
                {stringOf(hero, 'cta_text') ?? t.landing.becomePartner}
              </Button>
              <Button
                component={RouterLink}
                to="/login"
                size="large"
                variant="outlined"
                sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.6)' }}
              >
                {t.landing.staffLogin}
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Преимущества */}
      {features && (
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
          <Typography variant="h2" sx={{ mb: 1, color: 'primary.main' }}>
            {features.title}
          </Typography>
          {features.subtitle && (
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {features.subtitle}
            </Typography>
          )}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
            }}
          >
            {arrayOf<{ icon?: string; title: string; subtitle?: string }>(features).map((item) => (
              <Card key={item.title} sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ color: brand.gold, mb: 1, '& svg': { fontSize: 36 } }}>
                    {FEATURE_ICONS[item.icon ?? ''] ?? <VerifiedIcon />}
                  </Box>
                  <Typography variant="h6" sx={{ mb: 0.5 }}>
                    {item.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.subtitle}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      )}

      {/* Каталог */}
      {catalog && (
        <Box id="catalog" sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 8 } }}>
          <Container maxWidth="lg">
            <Typography variant="h2" sx={{ mb: 1, color: 'primary.main' }}>
              {catalog.title}
            </Typography>
            {catalog.subtitle && (
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                {catalog.subtitle}
              </Typography>
            )}
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' },
              }}
            >
              {arrayOf<{ title: string; count?: string; image_url?: string }>(catalog).map((item) => (
                <Card key={item.title} sx={{ height: '100%' }}>
                  {item.image_url && (
                    <Box
                      component="img"
                      src={mediaUrl(item.image_url)}
                      alt={item.title}
                      sx={{ width: '100%', height: 120, objectFit: 'cover' }}
                    />
                  )}
                  <CardContent>
                    <Typography variant="h6">{item.title}</Typography>
                    <Typography variant="body2" sx={{ color: brand.gold, fontWeight: 600 }}>
                      {item.count}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>

            {/* Блок на главной показывает группы, а не товары: за подробностями
                — на страницу продукции, где у каждой позиции своя карточка. */}
            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Button
                component={RouterLink}
                to="/products"
                variant="outlined"
                size="large"
                endIcon={<ArrowForwardIcon />}
              >
                {t.products.title}
              </Button>
            </Box>
          </Container>
        </Box>
      )}

      {/* О компании */}
      {about && (
        <Container id="about" maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
          <Typography variant="h2" sx={{ mb: 2, color: 'primary.main' }}>
            {about.title}
          </Typography>
          <Typography sx={{ mb: 3, maxWidth: 800 }}>{stringOf(about, 'text')}</Typography>
          <Stack spacing={1.5}>
            {arrayOf<string>(about, 'bullets').map(
              (bullet) => (
                <Stack key={bullet} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                  <VerifiedIcon sx={{ color: brand.gold, fontSize: 20, mt: 0.3 }} />
                  <Typography>{bullet}</Typography>
                </Stack>
              ),
            )}
          </Stack>
        </Container>
      )}

      {/* Новости и акции */}
      {news && news.items.length > 0 && (
        <Box id="news" sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 8 } }}>
          <Container maxWidth="lg">
            <Typography variant="h2" sx={{ mb: 3, color: 'primary.main' }}>
              {t.landing.newsAndPromo}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              }}
            >
              {news.items.map((post) => (
                <Card key={post.id} sx={{ height: '100%' }}>
                  {post.cover_url && (
                    <Box
                      component="img"
                      src={mediaUrl(post.cover_url)}
                      alt={post.title}
                      sx={{ width: '100%', height: 160, objectFit: 'cover' }}
                    />
                  )}
                  <CardContent>
                    <Chip
                      size="small"
                      label={t.news.categories[post.category] ?? post.category}
                      color={post.category === 'promo' ? 'secondary' : 'default'}
                      sx={{ mb: 1 }}
                    />
                    <Typography variant="h6" sx={{ mb: 0.5 }}>
                      {post.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {post.summary}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Container>
        </Box>
      )}

      {/* Контакты */}
      <Box id="contacts" sx={{ bgcolor: brand.green, color: '#fff', py: { xs: 5, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ mb: 3 }}>
            {contacts?.title ?? t.landing.contacts}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            }}
          >
            <Stack spacing={2}>
              {[
                { icon: <CallIcon />, value: stringOf(contacts, 'phone') ?? settings?.phone },
                { icon: <EmailIcon />, value: stringOf(contacts, 'email') ?? settings?.email },
                { icon: <PlaceIcon />, value: stringOf(contacts, 'address') ?? settings?.address },
                { icon: <ScheduleIcon />, value: stringOf(contacts, 'work_hours') },
              ]
                .filter((row) => row.value)
                .map((row, index) => (
                  <Stack key={index} direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
                    <Box sx={{ color: brand.gold, mt: 0.3 }}>{row.icon}</Box>
                    <Typography>{row.value}</Typography>
                  </Stack>
                ))}
            </Stack>

            <Box>
              <Logo height={56} dark />
              <Typography sx={{ mt: 2, opacity: 0.85 }}>
                {stringOf(contacts, 'legal_name') ?? settings?.legal_name}
              </Typography>
              <Button
                component={RouterLink}
                to="/login"
                variant="contained"
                color="secondary"
                sx={{ mt: 3 }}
              >
                {t.landing.staffLogin}
              </Button>
            </Box>
          </Box>

          <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.2)' }} />
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            © {new Date().getFullYear()} {settings?.company_name ?? 'QoQo'}. {t.landing.rights}
          </Typography>
        </Container>
      </Box>
    </Box>
  )
}
