import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  colorSchemes: {
    light: true,
    dark: true,
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: ['Inter', 'Roboto', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'].join(','),
    h1: { fontSize: '2rem', fontWeight: 600 },
    h2: { fontSize: '1.5rem', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
  },
})
