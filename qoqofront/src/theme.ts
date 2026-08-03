import { createTheme } from '@mui/material/styles'

// Фирменная палитра QoQo из брендбука.
export const brand = {
  green: '#00533B',
  greenDark: '#003D2B',
  greenLight: '#0B6E4F',
  gold: '#D4AF37',
  goldDark: '#B8942A',
  cream: '#F6F3E9',
  ink: '#333333',
} as const

export const theme = createTheme({
  cssVariables: true,
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
      default: '#FFFFFF',
      paper: '#FFFFFF',
    },
    text: {
      primary: brand.ink,
      secondary: '#5F5F5F',
    },
    success: { main: '#2E7D32' },
    warning: { main: '#ED6C02' },
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
      styleOverrides: {
        root: { borderColor: 'rgba(0, 83, 59, 0.14)' },
      },
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
        root: {
          borderRadius: 10,
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 83, 59, 0.10)',
            '&:hover': { backgroundColor: 'rgba(0, 83, 59, 0.16)' },
          },
        },
      },
    },
  },
})
