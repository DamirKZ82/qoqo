import AddCircleIcon from '@mui/icons-material/AddCircle'
import ArticleIcon from '@mui/icons-material/Article'
import BarChartIcon from '@mui/icons-material/BarChart'
import DashboardIcon from '@mui/icons-material/Dashboard'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import PeopleIcon from '@mui/icons-material/People'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import BugReportIcon from '@mui/icons-material/BugReport'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SettingsIcon from '@mui/icons-material/Settings'
import TelegramIcon from '@mui/icons-material/Telegram'
import StorefrontIcon from '@mui/icons-material/Storefront'
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn'
import RouteIcon from '@mui/icons-material/Route'
import Inventory2Icon from '@mui/icons-material/Inventory2'
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
import { APP_SHELL_CLASS, sidePanelPaper } from '../theme'
import { Logo } from './Logo'
import { OfflineBar } from './OfflineBar'
import { TelegramLink } from './TelegramLink'
import { LanguageSwitch, ThemeToggle } from './Preferences'

// Фирменный синий Telegram. Одинаков в светлой и тёмной теме: это цвет
// чужого бренда, и подстраивать его под нашу палитру неправильно.
const TELEGRAM_BLUE = '#229ED9'

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
      to: '/app/route',
      label: t.nav.route,
      icon: <RouteIcon />,
      group: 'work',
      // Складу маршрут не нужен, а руководителям он полезен для проверки.
      roles: ['admin', 'director', 'sales_rep'],
      mobile: true,
    },
    {
      to: '/app/routes',
      label: t.nav.routes,
      icon: <RouteIcon />,
      group: 'work',
      roles: ['admin', 'director', 'accountant'],
    },
    {
      to: '/app/returns',
      label: t.nav.returns,
      icon: <AssignmentReturnIcon />,
      group: 'work',
      roles: ['admin', 'director', 'accountant', 'warehouse'],
    },
    {
      to: '/app/settlements',
      label: t.nav.settlements,
      icon: <AccountBalanceWalletIcon />,
      group: 'work',
      roles: ['admin', 'director', 'accountant'],
    },
    {
      to: '/app/stock',
      label: t.nav.stock,
      icon: <Inventory2Icon />,
      group: 'work',
      roles: ['admin', 'director', 'accountant', 'warehouse'],
    },
    // Торговому точки нужны — там адрес, телефон и ссылка на 2ГИС, — но
    // остальные справочники это работа офиса, и в его меню им не место.
    // Поэтому один и тот же экран стоит в разных группах: у торгового это
    // «Мои точки» в работе, у остальных — справочник.
    {
      to: '/app/refs/outlets',
      label: t.nav.myOutlets,
      icon: <StorefrontIcon />,
      group: 'work',
      roles: ['sales_rep'],
    },
    {
      to: '/app/refs/outlets',
      label: t.nav.outlets,
      icon: <StorefrontIcon />,
      group: 'references',
      roles: ['admin', 'director', 'accountant', 'warehouse'],
    },
    {
      to: '/app/refs',
      label: t.nav.allReferences,
      icon: <ArticleIcon />,
      group: 'references',
      roles: ['admin', 'director', 'accountant', 'warehouse'],
    },

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
      to: '/app/import',
      label: t.nav.import,
      icon: <UploadFileIcon />,
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

  // Высота верхней полосы нужна дважды: ею же отодвигается вниз боковое меню,
  // потому что его панель прибита к окну, а не встроена в поток страницы.
  const HEADER_HEIGHT = isMobile ? 56 : 64

  const visible = navItems(t).filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  )
  const mobileItems = visible.filter((item) => item.mobile).slice(0, 4)

  // Совпадение считаем по границе сегмента пути, а не по подстроке: иначе
  // «/app/routes» подсвечивал бы и «/app/route».
  const matches = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`)

  // Из нескольких подходящих пунктов активен самый длинный: на «/app/orders/new»
  // должна гореть «Новая заявка», а не «Заявки».
  const activePath = visible
    .map((item) => item.to)
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0]

  const isActive = (to: string) => to === activePath

  const activeMobile = mobileItems.findIndex((item) => isActive(item.to))

  // Выход сам уводит на сайт: см. комментарий в AuthContext.logout.
  const handleLogout = logout

  const menu = (
    <Box sx={{ width: 264, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* На большом экране логотип живёт в верхней полосе. На телефоне шторка
          закрывает её собой, и без логотипа теряется, чьё это меню. */}
      {isMobile && (
        <>
          <Box sx={{ p: 2 }}>
            {/* Логотип ведёт на сайт: это его привычное поведение в шапке. */}
            {/* Панель зелёная в обеих темах, поэтому вариант логотипа задаём
                явно: сам он ориентируется на тему, а не на подложку. */}
            <Box component={RouterLink} to="/" sx={{ display: 'inline-flex' }}>
              <Logo height={40} dark />
            </Box>
          </Box>
          <Divider />
        </>
      )}

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 1, py: 1 }}>
        {GROUPS.map((group) => {
          const items = visible.filter((item) => item.group === group)
          if (items.length === 0) return null
          return (
            <List
              key={group}
              dense
              subheader={
                // disableSticky: иначе прозрачный заголовок группы
                // при прокрутке наезжает на пункты меню.
                <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px' }}>
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

    </Box>
  )

  return (
    <Box
      className={APP_SHELL_CLASS}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      {/* Одна полоса во всю ширину страницы. Раньше логотип сидел в отдельной
          панельке над меню, и верх страницы был разрезан пополам вертикальной
          линией: две шапки вместо одной. */}
      <AppBar
        position="sticky"
        sx={{
          // Меню прибито к окну и по умолчанию лежит выше шапки — без этого
          // его панель наползала бы на полосу сверху.
          zIndex: (current) => current.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          borderRadius: '0 0 16px 16px',
        }}
      >
        <Toolbar sx={{ gap: 1, minHeight: HEADER_HEIGHT, height: HEADER_HEIGHT }}>
          {isMobile && (
            <IconButton
              edge="start"
              // Снимаем фокус с кнопки: открытая шторка накрывает содержимое
              // aria-hidden, а сфокусированный элемент под ним недопустим —
              // на это ругаются и браузер, и программы чтения с экрана.
              onClick={(event) => {
                event.currentTarget.blur()
                setDrawerOpen(true)
              }}
              aria-label={t.nav.menu}
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* Логотип ведёт на сайт: это его привычное поведение в шапке. */}
          <Box component={RouterLink} to="/" sx={{ display: 'inline-flex' }}>
            <Logo height={isMobile ? 36 : 44} />
          </Box>

          <Box sx={{ flexGrow: 1 }} />
          <LanguageSwitch />
          <ThemeToggle />

          <Tooltip title={t.telegram.title}>
            <IconButton onClick={() => setTelegramOpen(true)} size="small">
              <TelegramIcon
                fontSize="small"
                // Привязан — красим в цвет самого телеграма, а не в
                // фирменный зелёный: так значок читается как «связано с
                // Telegram», а не как ещё один элемент нашего интерфейса.
                sx={{ color: user?.telegram_linked ? TELEGRAM_BLUE : 'inherit' }}
              />
            </IconButton>
          </Tooltip>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: 1 }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: 13 }}>
              {user ? initials(user.full_name) : '?'}
            </Avatar>
            {/* Имя на телефон не помещается — там только аватар. */}
            {!isMobile && (
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                  {user?.full_name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {user ? t.roles[user.role] : ''}
                </Typography>
              </Box>
            )}
          </Stack>

          <Tooltip title={t.nav.logout}>
            <IconButton onClick={handleLogout} size="small">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        {!isMobile && (
          <Drawer
            variant="permanent"
            sx={(current) => ({
              width: 264,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: 264,
                boxSizing: 'border-box',
                // Панель начинается под полосой, а не под верхом окна.
                top: HEADER_HEIGHT,
                height: 'auto',
                bottom: 0,
                // Скруглён только внутренний угол: остальные три упираются в
                // край окна, и округлять их не во что.
                borderTopRightRadius: 16,
                ...sidePanelPaper(current),
              },
            })}
          >
            {menu}
          </Drawer>
        )}

        {isMobile && (
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            sx={(current) => ({ '& .MuiDrawer-paper': sidePanelPaper(current) })}
          >
            {menu}
          </Drawer>
        )}

        <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <OfflineBar />

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
