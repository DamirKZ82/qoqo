import Box from '@mui/material/Box'

import { mediaUrl } from '../api/client'
import { useSettings } from '../api/queries'
import logoSrc from '../assets/logo.svg'

interface LogoProps {
  /** Высота логотипа в пикселях. */
  height?: number
  /** Использовать вариант для тёмного фона, если он загружен в настройках. */
  dark?: boolean
}

/**
 * Логотип компании.
 *
 * Берётся из настроек системы, если администратор загрузил свой файл,
 * иначе используется фирменный логотип, вшитый в сборку.
 */
export function Logo({ height = 40, dark = false }: LogoProps) {
  const { data: settings } = useSettings()

  const uploaded = dark ? settings?.logo_dark_url || settings?.logo_url : settings?.logo_url
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
        // Белый логотип на зелёной шапке, когда отдельный файл не загружен.
        filter: dark && !settings?.logo_dark_url ? 'brightness(0) invert(1)' : 'none',
      }}
    />
  )
}
