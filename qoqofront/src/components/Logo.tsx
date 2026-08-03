import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'

import { mediaUrl } from '../api/client'
import { useSettings } from '../api/queries'
import logoDarkSrc from '../assets/logo-dark.svg'
import logoSrc from '../assets/logo.svg'

interface LogoProps {
  /** Высота логотипа в пикселях. */
  height?: number
  /**
   * Вариант для тёмного фона. По умолчанию включается сам в тёмной теме;
   * задавать явно нужно только на зелёных блоках светлой темы.
   */
  dark?: boolean
}

/**
 * Логотип компании.
 *
 * Берётся из настроек системы, если администратор загрузил свой файл,
 * иначе используется фирменный логотип, вшитый в сборку.
 *
 * Для тёмного фона используется отдельный файл, а не CSS-фильтр: фильтр
 * перекрасил бы в белый весь знак, включая гребешок и клюв, — а они должны
 * оставаться золотыми. В `logo-dark.svg` белым сделаны только буквы.
 */
export function Logo({ height = 40, dark }: LogoProps) {
  const { data: settings } = useSettings()
  const theme = useTheme()

  const onDark = dark ?? theme.palette.mode === 'dark'
  const uploaded = onDark ? settings?.logo_dark_url || settings?.logo_url : settings?.logo_url
  const fallback = onDark ? logoDarkSrc : logoSrc

  return (
    <Box
      component="img"
      src={mediaUrl(uploaded) ?? fallback}
      alt={settings?.company_name ?? 'QoQo'}
      sx={{ height, width: 'auto', display: 'block' }}
    />
  )
}
