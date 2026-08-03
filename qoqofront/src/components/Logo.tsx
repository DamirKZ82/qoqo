import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'

import { mediaUrl } from '../api/client'
import { useSettings } from '../api/queries'
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
 */
export function Logo({ height = 40, dark }: LogoProps) {
  const { data: settings } = useSettings()
  const theme = useTheme()

  const onDark = dark ?? theme.palette.mode === 'dark'
  const uploaded = onDark ? settings?.logo_dark_url || settings?.logo_url : settings?.logo_url
  const src = mediaUrl(uploaded) ?? logoSrc

  return (
    <Box
      component="img"
      src={src}
      alt={settings?.company_name ?? 'QoQo'}
      sx={{
        height,
        width: 'auto',
        display: 'block',
        // Белый логотип на тёмном фоне, когда отдельный файл не загружен.
        filter: onDark && !settings?.logo_dark_url ? 'brightness(0) invert(1)' : 'none',
      }}
    />
  )
}
