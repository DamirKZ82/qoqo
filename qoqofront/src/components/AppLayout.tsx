import AddCircleIcon from '@mui/icons-material/AddCircle'
import ArticleIcon from '@mui/icons-material/Article'
import BarChartIcon from '@mui/icons-material/BarChart'
import DashboardIcon from '@mui/icons-material/Dashboard'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import PeopleIcon from '@mui/icons-material/People'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import BugReportIcon from '@mui/icons-material/BugReport'
import SettingsIcon from '@mui/icons-material/Settings'
import TelegramIcon from '@mui/icons-material/Telegram'
import StorefrontIcon from '@mui/icons-material/Storefront'
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt'
import WarehouseIcon from '@mui/icons-material/Warehouse'

import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { useState, type ReactElement } from 'react'
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import type { UserRole } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useT, type Dictionary } from '../i18n'
import { Logo } from './Logo'
import { TelegramLink } from './TelegramLink'
import { LanguageSwitch, ThemeToggle } from './Preferences'

type NavGroup = 'work' | 'references' | 'administration'

interface NavItem {
  to: string
  label: string
  icon: ReactElement
  roles?: UserRole[]
  group: NavGroup
  /** Показывать в нижней панели на телефоне. */
  mobile?: boolean
}

const GROUPS: NavGroup[] = ['work', 'references', 'administration']

function navItems(t: Dictionary): NavItem[] {
  return [
    { to: '/app', label: t.nav.dashboard, icon: <DashboardIcon />, group: 'work', mobile: true },
    { to: '/app/orders', label: t.nav.orders, icon: <ReceiptLongIcon />, group: 'work', mobile: true },
    {
      to: '/app/orders/new',
      label: t.nav.newOrder,
      icon: <AddCircleIcon />,
      group: 'work',
      roles: ['admin', 'director', 'sales_rep'],
      mobile: true,
    },
    {
      to: '/app/warehouse',
      label: t.nav.warehouse,
      icon: <WarehouseIcon />,
      group: 'work',
      roles: ['admin', 'director', 'warehouse'],
      mobile: true,
    },
    {
      to: '/app/reports',
      label: t.nav.reports,
      icon: <BarChartIcon />,
      group: 'work',
      roles: ['admin', 'director', 'accountant', 'sales_rep'],
    },

    {
      to: '/app/refs/outlets',
      label: t.nav.outlets,
      icon: <StorefrontIcon />,
      group: 'references',
    },
    { to: '/app/refs', label: t.nav.allReferences, icon: <ArticleIcon />, group: 'references' },

    {
      to: '/app/users',
      label: t.nav.users,
      icon: <PeopleIcon />,
      group: 'administration',
      roles: ['admin'],
    },
    {
      to: '/app/content',
      label: t.nav.content,
      icon: <ViewQuiltIcon />,
      group: 'administration',
      roles: ['admin', 'director', 'accountant'],
    },
    {
      to: '/app/logs',
      label: t.nav.logs,
      icon: <BugReportIcon />,
      group: 'administration',
      roles: ['admin'],
    },
    {
      to: '/app/settings',
      label: t.nav.settings,
      icon: <SettingsIcon />,
      group: 'administration',
      roles: ['admin'],
    },
  ]
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppLayout() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const t = useT()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [telegramOpen, setTelegramOpen] = useState(false)

  const visible = navItems(t).filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  )
  const mobileItems = visible.filter((item) => item.mobile).slice(0, 4)

  // Точное совпадение для «Сводки», иначе — по префиксу пути.
  const isActive = (to: string) =>
    to === '/app' ? location.pathname === '/app' : location.pathname.startsWith(to)

  const activeMobile = mobileItems.findIndex((item) => isActive(item.to))

  // Выход сам уводит на сайт: см. комментарий в AuthContext.logout.
  const handleLogout = logout

  const menu = (
    <Box sx={{ width: 264, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2 }}>
        <Logo height={36} />
      </Box>
      <Divider />

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 1, py: 1 }}>
        {GROUPS.map((group) => {
          const items = visible.filter((item) => item.group === group)
          if (items.length === 0) return null
          return (
            <List
              key={group}
              dense
              subheader={
                <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: '32px' }}>
                  {t.nav.groups[group]}
                </ListSubheader>
              }
            >
              {items.map((item) => (
                <ListItemButton
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  selected={isActive(item.to)}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              ))}
            </List>
          )
        })}
      </Box>

      <Divider />
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={0.5} sx={{ mb: 1, alignItems: 'center' }}>
          <LanguageSwitch />
          <ThemeToggle />
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontSize: 14 }}>
            {user ? initials(user.full_name) : '?'}
          </Avatar>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {user?.full_name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {user ? t.roles[user.role] : ''}
            </Typography>
          </Box>
          <Tooltip title={t.telegram.title}>
            <IconButton onClick={() => setTelegramOpen(true)} size="small">
              <TelegramIcon fontSize="small" color={user?.telegram_linked ? 'primary' : 'inherit'} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t.nav.logout}>
            <IconButton onClick={handleLogout} size="small">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: 264,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: 264, boxSizing: 'border-box' },
          }}
        >
          {menu}
        </Drawer>
      )}

      {isMobile && (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          {menu}
        </Drawer>
      )}

      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {isMobile && (
          <AppBar
            position="sticky"
            sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
          >
            <Toolbar sx={{ gap: 1 }}>
              <IconButton edge="start" onClick={() => setDrawerOpen(true)} aria-label={t.nav.menu}>
                <MenuIcon />
              </IconButton>
              <Logo height={28} />
              <Box sx={{ flexGrow: 1 }} />
              <LanguageSwitch />
              <ThemeToggle />
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: 13 }}>
                {user ? initials(user.full_name) : '?'}
              </Avatar>
            </Toolbar>
          </AppBar>
        )}

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, md: 3 },
            // Запас снизу, чтобы контент не уезжал под нижнюю панель на телефоне.
            pb: isMobile ? 10 : 3,
            maxWidth: 1400,
            width: '100%',
          }}
        >
          <Outlet />
        </Box>
      </Box>

      <TelegramLink open={telegramOpen} onClose={() => setTelegramOpen(false)} />

      {isMobile && (
        <Paper
          elevation={3}
          sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1200 }}
        >
          <BottomNavigation
            showLabels
            value={activeMobile === -1 ? false : activeMobile}
            onChange={(_, index: number) => navigate(mobileItems[index].to)}
          >
            {mobileItems.map((item) => (
              <BottomNavigationAction key={item.to} label={item.label} icon={item.icon} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  )
}
