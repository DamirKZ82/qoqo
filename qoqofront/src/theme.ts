import type { CSSObject, Theme } from '@mui/material/styles'
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
 * Бумажные стикеры рабочей области.
 *
 * Карточки и диалоги внутри системы окрашены как бумага, а не как белый лист
 * экрана: жёлтый взят приглушённый, матовый — на нём весь день читают цифры, и
 * насыщенный цвет к вечеру утомляет. Сайт это не затрагивает: там своё
 * оформление, стикеры уместны только за рабочим столом.
 */
export const note = {
  light: {
    // Светлее бумаги и желтее её: цвет цыплёнка. Жёлтого прибавлено за счёт
    // синевы, а не яркости, — иначе карточка сравнялась бы по светлоте с фоном
    // и края бы пропали.
    bg: '#FEF8D4',
    border: 'rgba(184, 148, 42, 0.32)',
    shadow: '0 1px 2px rgba(93, 74, 20, 0.07)',
  },
  dark: {
    bg: '#2A261C',
    border: 'rgba(212, 175, 55, 0.22)',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
  },
} as const

/**
 * Листок бокового меню — бледно-зелёный.
 *
 * Меню не содержимое, а навигация, и цветом отделено от жёлтых карточек: глаз
 * сразу видит, где кончается «что смотрю» и начинается «куда идти». Зелень
 * взята фирменная, разбавленная почти до белого, — иначе меню перетягивало бы
 * внимание на себя весь день.
 */
export const sideNote = {
  light: {
    bg: '#E8F1EA',
    border: 'rgba(0, 83, 59, 0.16)',
    shadow: '0 1px 2px rgba(0, 60, 42, 0.06)',
  },
  dark: {
    bg: '#1B241F',
    border: 'rgba(92, 199, 156, 0.16)',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
  },
} as const

/**
 * Зелёный листок для панели бокового меню.
 *
 * Отдельной функцией, а не правилом темы: шторку меню рисует и сайт, а красить
 * его в цвета системы незачем.
 */
export function sideNotePaper(current: Theme): CSSObject {
  return {
    backgroundColor: sideNote.light.bg,
    borderColor: sideNote.light.border,
    backgroundImage: 'none',
    ...current.applyStyles('dark', {
      backgroundColor: sideNote.dark.bg,
      borderColor: sideNote.dark.border,
    }),
  }
}

/** Класс на корне рабочей области. По нему стикеры отличают систему от сайта. */
export const APP_SHELL_CLASS = 'qoqo-app'

/**
 * Стиль листка для карточек рабочей области.
 *
 * Тёмная ветка вложена внутрь селектора, а не надета сверху: класс темы висит
 * на <html>, и снаружи он оказался бы правее класса рабочей области.
 */
function stickyNote({ theme: current }: { theme: Theme }): CSSObject {
  return {
    [`.${APP_SHELL_CLASS} &`]: {
      backgroundColor: note.light.bg,
      borderColor: note.light.border,
      boxShadow: note.light.shadow,
      // Тёмная тема осветляет Paper плёнкой по высоте тени — поверх листка она
      // даёт серый налёт.
      backgroundImage: 'none',
      ...current.applyStyles('dark', {
        backgroundColor: note.dark.bg,
        borderColor: note.dark.border,
        boxShadow: note.dark.shadow,
      }),
    },
  }
}

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
    // Montserrat в обычном начертании выглядит бледно: у неё широкие буквы и
    // тонкие штрихи, и на светлом фоне текст будто выцветает. Берём средний
    // вес как основной — он уже загружается, страница не тяжелеет.
    fontWeightRegular: 500,
    fontWeightMedium: 600,
    body1: { fontWeight: 500 },
    body2: { fontWeight: 500 },
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
    MuiCssBaseline: {
      styleOverrides: {
        // Chrome при автозаполнении закрашивает поле своим фоном и не смотрит на
        // тему: в тёмном оформлении получается светло-синий прямоугольник, на
        // котором не читаются ни подпись, ни текст. Перекрываем фон тенью
        // внутрь — цвет самого поля переопределить нельзя.
        'input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, input:-webkit-autofill:active':
          {
            WebkitBoxShadow: '0 0 0 1000px var(--mui-palette-background-paper) inset',
            WebkitTextFillColor: 'var(--mui-palette-text-primary)',
            caretColor: 'var(--mui-palette-text-primary)',
            borderRadius: 'inherit',
            // Анимация отодвигает применение стиля до момента, когда Chrome
            // уже нарисовал свой фон.
            transition: 'background-color 100000s ease-in-out 0s',
          },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 20 },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: stickyNote },
    },
    MuiAccordion: {
      // Список ошибок выложен раскрывающимися блоками, а не карточками. Для
      // глаза это те же листки, поэтому и цвет им тот же.
      styleOverrides: { root: stickyNote },
    },
    MuiDialog: {
      // Диалоги живут в отдельном узле страницы, до них класс рабочей области
      // не достаёт. Красим без него: диалогов на сайте нет.
      styleOverrides: {
        paper: ({ theme: current }) => ({
          backgroundColor: note.light.bg,
          // Тёмная тема подмешивает Paper светлую плёнку по высоте тени —
          // поверх стикера она даёт серый налёт.
          backgroundImage: 'none',
          ...current.applyStyles('dark', { backgroundColor: note.dark.bg }),
        }),
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
