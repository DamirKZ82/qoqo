import { createTheme } from '@mui/material/styles'

// Фирменная палитра QoQo из брендбука.
export const brand = {
  green: '#00533B',
  greenDark: '#003D2B',
  greenLight: '#0B6E4F',
  // Светлые ступени той же зелени. Нужны там, где фирменный тёмно-зелёный
  // теряется: на тёмной теме и в графиках.
  greenSoft: '#14805E',
  greenBright: '#2E9E72',
  greenPale: '#5CC79C',
  gold: '#D4AF37',
  goldLight: '#E3C25A',
  goldDark: '#B8942A',
  cream: '#F6F3E9',
  ink: '#333333',
} as const

/**
 * Цвета столбцов графика — отдельно для каждой темы.
 *
 * Тёмная тема не «перевёрнутая» светлая: на тёмной подложке фирменный
 * #00533B почти сливается с фоном, поэтому взята более светлая ступень той же
 * зелени. Обе проверены на контраст к своей подложке.
 */
export const chartColors = {
  light: { bar: brand.greenSoft, barHover: brand.green },
  dark: { bar: brand.greenBright, barHover: brand.greenPale },
} as const

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  defaultColorScheme: 'light',
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: brand.green,
          dark: brand.greenDark,
          light: brand.greenLight,
          contrastText: '#FFFFFF',
        },
        secondary: {
          main: brand.gold,
          dark: brand.goldDark,
          contrastText: '#1A1A1A',
        },
        background: {
          default: '#F7F8F7',
          paper: '#FFFFFF',
        },
        text: {
          primary: brand.ink,
          secondary: '#5F5F5F',
        },
        divider: 'rgba(0, 83, 59, 0.14)',
        success: { main: '#2E7D32' },
        warning: { main: '#ED6C02' },
      },
    },
    dark: {
      palette: {
        primary: {
          main: brand.greenBright,
          dark: brand.greenSoft,
          light: brand.greenPale,
          contrastText: '#08140F',
        },
        secondary: {
          main: brand.goldLight,
          dark: brand.gold,
          contrastText: '#1A1A1A',
        },
        background: {
          default: '#101210',
          paper: '#181B18',
        },
        text: {
          primary: '#E8EBE7',
          secondary: '#A7B0A6',
        },
        divider: 'rgba(255, 255, 255, 0.14)',
        success: { main: '#66BB6A' },
        warning: { main: '#FFA726' },
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: ['Montserrat', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(','),
    // Заголовки — Playfair Display, как в брендбуке.
    h1: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 700, fontSize: '2.25rem' },
    h2: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 700, fontSize: '1.75rem' },
    h3: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 700, fontSize: '1.4rem' },
    h4: { fontWeight: 700, fontSize: '1.2rem' },
    h5: { fontWeight: 600, fontSize: '1.05rem' },
    h6: { fontWeight: 600, fontSize: '1rem' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 20 },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme: current }) => ({
          borderRadius: 10,
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 83, 59, 0.10)',
            '&:hover': { backgroundColor: 'rgba(0, 83, 59, 0.16)' },
            ...current.applyStyles('dark', {
              backgroundColor: 'rgba(46, 158, 114, 0.20)',
              '&:hover': { backgroundColor: 'rgba(46, 158, 114, 0.28)' },
            }),
          },
        }),
      },
    },
  },
})
