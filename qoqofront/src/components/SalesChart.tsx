import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'

import type { SalesPoint } from '../api/types'
import { formatCompactMoney, formatMoney } from '../lib/format'
import { brand } from '../theme'

const HEIGHT = 260
const PADDING = { top: 20, right: 8, bottom: 28, left: 64 }
const MAX_BAR_WIDTH = 24
// Просвет между соседними столбцами: разделяет их фон, а не обводка.
const BAR_GAP = 2
const BAR_RADIUS = 4

/** Ширина контейнера — столбцы считаем в пикселях, чтобы ничего не растягивалось. */
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    setWidth(node.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

/** Шаг шкалы округляем до «человеческого», иначе на оси появляется 1,3 млн. */
function niceStep(rough: number): number {
  if (rough <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude
    if (candidate >= rough) return candidate
  }
  return 10 * magnitude
}

/** Столбец со скруглённой шапкой и прямым основанием. */
function barPath(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(BAR_RADIUS, width / 2, height)
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${x + width - radius} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + radius}`,
    `L ${x + width} ${y + height}`,
    'Z',
  ].join(' ')
}

interface SalesChartProps {
  points: SalesPoint[]
}

export function SalesChart({ points }: SalesChartProps) {
  const [ref, width] = useElementWidth()
  const [hovered, setHovered] = useState<number | null>(null)

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 0)
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom

  const values = points.map((point) => Number(point.total_amount) || 0)
  const peak = Math.max(...values, 0)
  const step = niceStep((peak || 1) / 4)
  const scaleMax = Math.max(Math.ceil(peak / step) * step, step)
  const ticks = Array.from({ length: Math.round(scaleMax / step) + 1 }, (_, index) => index * step)

  const band = points.length > 0 ? plotWidth / points.length : 0
  const barWidth = Math.max(Math.min(MAX_BAR_WIDTH, band - BAR_GAP), 1)

  // Подписи оси времени прореживаем, иначе они наезжают друг на друга.
  const labelStep = Math.max(1, Math.ceil(points.length / Math.max(Math.floor(plotWidth / 44), 1)))
  const peakIndex = peak > 0 ? values.indexOf(peak) : -1
  const active = hovered !== null ? points[hovered] : null

  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%' }}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="Динамика продаж по периодам">
          {ticks.map((tick) => {
            const y = PADDING.top + plotHeight - (tick / scaleMax) * plotHeight
            return (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(0, 0, 0, 0.08)"
                  strokeWidth={1}
                />
                <text
                  x={PADDING.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="#5F5F5F"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {tick === 0 ? '0' : formatCompactMoney(tick)}
                </text>
              </g>
            )
          })}

          {points.map((point, index) => {
            const value = values[index]
            const height = scaleMax > 0 ? (value / scaleMax) * plotHeight : 0
            const x = PADDING.left + index * band + (band - barWidth) / 2
            const y = PADDING.top + plotHeight - height
            const isHovered = hovered === index

            return (
              <g
                key={point.period}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>{`${point.title}: ${formatMoney(point.total_amount)}`}</title>
                {/* Прозрачная полоса во всю высоту — попасть в неё легче, чем в столбец. */}
                <rect
                  x={PADDING.left + index * band}
                  y={PADDING.top}
                  width={Math.max(band, 1)}
                  height={plotHeight}
                  fill={isHovered ? 'rgba(0, 83, 59, 0.05)' : 'transparent'}
                />
                {height > 0 && (
                  <path
                    d={barPath(x, y, barWidth, height)}
                    fill={isHovered ? brand.greenDark : brand.green}
                  />
                )}
                {index === peakIndex && barWidth >= 12 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 7}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="#333333"
                  >
                    {formatCompactMoney(value)}
                  </text>
                )}
                {index % labelStep === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={HEIGHT - 9}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#5F5F5F"
                  >
                    {point.label}
                  </text>
                )}
              </g>
            )
          })}

          <line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={PADDING.top + plotHeight}
            y2={PADDING.top + plotHeight}
            stroke="rgba(0, 0, 0, 0.16)"
            strokeWidth={1}
          />
        </svg>
      )}

      {active && (
        <Paper
          elevation={4}
          sx={{
            position: 'absolute',
            // Не даём подсказке уехать за края графика.
            left: Math.min(
              Math.max(PADDING.left + ((hovered ?? 0) + 0.5) * band, 88),
              Math.max(width - 88, 88),
            ),
            top: 0,
            transform: 'translateX(-50%)',
            px: 1.5,
            py: 1,
            pointerEvents: 'none',
            minWidth: 140,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {active.title}
          </Typography>
          <Typography sx={{ fontWeight: 700 }}>{formatMoney(active.total_amount)}</Typography>
          <Typography variant="caption" color="text.secondary">
            Заявок: {active.orders_count}
          </Typography>
        </Paper>
      )}
    </Box>
  )
}
