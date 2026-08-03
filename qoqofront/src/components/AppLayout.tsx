import AddCircleIcon from '@mui/icons-material/AddCircle'
import ArticleIcon from '@mui/icons-material/Article'
import DashboardIcon from '@mui/icons-material/Dashboard'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import PeopleIcon from '@mui/icons-material/People'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import SettingsIcon from '@mui/icons-material/Settings'
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
import { Logo } from './Logo'

interface NavItem {
  to: string
  label: string
  icon: ReactElement
  roles?: UserRole[]
  group: 'Работа' | 'Справочники' | 'Администрирование'
  /** Показывать в нижней панели на телефоне. */
  mobile?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Сводка', icon: <DashboardIcon />, group: 'Работа', mobile: true },
  { to: '/app/orders', label: 'Заявки', icon: <ReceiptLongIcon />, group: 'Работа', mobile: true },
  {
    to: '/app/orders/new',
    label: 'Новая заявка',
    icon: <AddCircleIcon />,
    group: 'Работа',
    roles: ['admin', 'director', 'sales_rep'],
    mobile: true,
  },
  {
    to: '/app/warehouse',
    label: 'Склад',
    icon: <WarehouseIcon />,
    group: 'Работа',
    roles: ['admin', 'director', 'warehouse'],
    mobile: true,
  },

  { to: '/app/refs/outlets', label: 'Торговые точки', icon: <StorefrontIcon />, group: 'Справочники' },
  { to: '/app/refs', label: 'Все справочники', icon: <ArticleIcon />, group: 'Справочники' },

  {
    to: '/app/users',
    label: 'Сотрудники',
    icon: <PeopleIcon />,
    group: 'Администрирование',
    roles: ['admin'],
  },
  {
    to: '/app/content',
    label: 'Главная страница',
    icon: <ViewQuiltIcon />,
    group: 'Администрирование',
    roles: ['admin', 'director', 'accountant'],
  },
  {
    to: '/app/settings',
    label: 'Настройки',
    icon: <SettingsIcon />,
    group: 'Администрирование',
    roles: ['admin'],
  },
]

const GROUPS = ['Работа', 'Справочники', 'Администрирование'] as const

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
  const [drawerOpen, setDrawerOpen] = useState(false)

  const visible = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  )
  const mobileItems = visible.filter((item) => item.mobile).slice(0, 4)

  // Точное совпадение для «Сводки», иначе — по префиксу пути.
  const isActive = (to: string) =>
    to === '/app' ? location.pathname === '/app' : location.pathname.startsWith(to)

  const activeMobile = mobileItems.findIndex((item) => isActive(item.to))

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

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
                  {group}
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
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontSize: 14 }}>
            {user ? initials(user.full_name) : '?'}
          </Avatar>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {user?.full_name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {user?.role_title}
            </Typography>
          </Box>
          <Tooltip title="Выйти">
            <IconButton onClick={handleLogout} size="small">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#F7F8F7' }}>
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
          <AppBar position="sticky" sx={{ bgcolor: '#fff', borderBottom: 1, borderColor: 'divider' }}>
            <Toolbar sx={{ gap: 1 }}>
              <IconButton edge="start" onClick={() => setDrawerOpen(true)} aria-label="Меню">
                <MenuIcon />
              </IconButton>
              <Logo height={28} />
              <Box sx={{ flexGrow: 1 }} />
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
