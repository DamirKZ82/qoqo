import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import TranslateIcon from '@mui/icons-material/Translate'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import { useColorScheme } from '@mui/material/styles'
import { useState } from 'react'

import { LANGUAGES, useLanguage, useT } from '../i18n'

/** Переключатель светлой и тёмной темы. */
export function ThemeToggle({ size = 'small' }: { size?: 'small' | 'medium' }) {
  const t = useT()
  const { mode, systemMode, setMode } = useColorScheme()

  // mode === 'system' — тему выбирает операционная система; какая получилась,
  // говорит systemMode.
  const current = (mode === 'system' ? systemMode : mode) ?? 'light'
  const next = current === 'dark' ? 'light' : 'dark'
  const title = next === 'dark' ? t.appearance.toDark : t.appearance.toLight

  return (
    <Tooltip title={title}>
      <IconButton size={size} onClick={() => setMode(next)} aria-label={title}>
        {current === 'dark' ? (
          <LightModeIcon fontSize={size} />
        ) : (
          <DarkModeIcon fontSize={size} />
        )}
      </IconButton>
    </Tooltip>
  )
}

/** Выбор языка интерфейса. */
export function LanguageSwitch({ size = 'small' }: { size?: 'small' | 'medium' }) {
  const t = useT()
  const { language, setLanguage } = useLanguage()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const current = LANGUAGES.find((item) => item.code === language)

  return (
    <>
      <Tooltip title={t.language.label}>
        <Button
          size={size}
          color="inherit"
          onClick={(event) => setAnchor(event.currentTarget)}
          startIcon={<TranslateIcon fontSize={size} />}
          sx={{ minWidth: 0, paddingInline: 1 }}
        >
          {current?.short}
        </Button>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {LANGUAGES.map((item) => (
          <MenuItem
            key={item.code}
            selected={item.code === language}
            onClick={() => {
              setLanguage(item.code)
              setAnchor(null)
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
