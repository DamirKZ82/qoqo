import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DownloadIcon from '@mui/icons-material/Download'
import ErrorIcon from '@mui/icons-material/Error'
import UploadFileIcon from '@mui/icons-material/UploadFile'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { api, errorMessage } from '../../api/client'

type ImportKind = 'nomenclature' | 'counterparties' | 'outlets' | 'stock'

const KINDS: { value: ImportKind; label: string; hint: string }[] = [
  { value: 'nomenclature', label: 'Номенклатура', hint: 'Товары, цены, группы и единицы' },
  { value: 'counterparties', label: 'Контрагенты', hint: 'Магазины и сети как юридические лица' },
  { value: 'outlets', label: 'Торговые точки', hint: 'Адреса доставки с координатами' },
  {
    value: 'stock',
    label: 'Начальные остатки',
    hint: 'Заводятся инвентаризацией: повторная загрузка не удвоит запас',
  },
]

interface Column {
  key: string
  title: string
  required: boolean
  hint: string | null
}

interface Row {
  line: number
  values: Record<string, string | null>
  errors: string[]
  action: string
}

interface Preview {
  kind_title: string
  columns: Column[]
  rows: Row[]
  total: number
  valid: number
  invalid: number
  to_create: number
  to_update: number
}

export function ImportPage() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<ImportKind>('nomenclature')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // Состав колонок для выбранного вида — нужен до выбора файла.
  const { data: columns } = useQuery({
    queryKey: ['imports', 'columns', kind],
    queryFn: async () => (await api.get<Column[]>(`/imports/columns/${kind}`)).data,
  })

  /**
   * Скачивание образца.
   *
   * Через API, а не обычной ссылкой: ссылка вида «/api/v1/…» уходит на домен
   * сайта, где такого пути нет, и правило SPA-роутинга отдаёт index.html —
   * вместо образца скачивался пустой html. Заодно так уходит и токен: ссылка
   * заголовков не несёт.
   */
  async function downloadTemplate() {
    setDownloading(true)
    setError(null)
    try {
      const response = await api.get(`/imports/template/${kind}`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `qoqo-${kind}-образец.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(errorMessage(err, 'Не удалось скачать образец'))
    } finally {
      setDownloading(false)
    }
  }

  const upload = useMutation({
    mutationFn: async (target: 'preview' | 'apply') => {
      const body = new FormData()
      body.append('file', file!)
      const { data } = await api.post(`/imports/${kind}/${target}`, body)
      return data
    },
  })

  function reset() {
    setPreview(null)
    setDone(null)
    setError(null)
  }

  async function runPreview(chosen: File) {
    reset()
    setFile(chosen)
    try {
      const data = await upload.mutateAsync('preview')
      setPreview(data as Preview)
    } catch (cause) {
      setError(errorMessage(cause, 'Не удалось прочитать файл'))
    }
  }

  async function runApply() {
    setError(null)
    try {
      const data = (await upload.mutateAsync('apply')) as { message: string }
      setDone(data.message)
      setPreview(null)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      // Справочники и остатки изменились — сбрасываем всё, что их показывает.
      queryClient.invalidateQueries()
    } catch (cause) {
      setError(errorMessage(cause, 'Не удалось загрузить данные'))
    }
  }

  const current = KINDS.find((item) => item.value === kind)!

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Импорт из файла</Typography>
        <Typography color="text.secondary" variant="body2">
          Загрузка справочников и начальных остатков из Excel или CSV. Сначала предпросмотр —
          в базу ничего не пишется, пока вы не подтвердите.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              select
              label="Что загружаем"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as ImportKind)
                reset()
              }}
              helperText={current.hint}
              fullWidth
            >
              {KINDS.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="contained"
                startIcon={<UploadFileIcon />}
                onClick={() => inputRef.current?.click()}
                disabled={upload.isPending}
              >
                Выбрать файл
              </Button>
              <Button
                startIcon={<DownloadIcon />}
                onClick={() => void downloadTemplate()}
                disabled={downloading}
              >
                Скачать образец
              </Button>
              {file && (
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  {file.name}
                </Typography>
              )}
            </Stack>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.csv"
              hidden
              onChange={(event) => {
                const chosen = event.target.files?.[0]
                if (chosen) void runPreview(chosen)
              }}
            />

            <Box>
              <Typography variant="caption" color="text.secondary">
                Колонки. Выделенные обязательны:
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {/* Состав берём у сервера сразу: раньше он появлялся только
                    после разбора файла, то есть когда ошибку уже совершили. */}
                {(preview?.columns ?? columns ?? []).map((column) => (
                  <Chip
                    key={column.key}
                    size="small"
                    label={column.title}
                    color={column.required ? 'primary' : 'default'}
                    variant={column.required ? 'filled' : 'outlined'}
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {upload.isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {done && (
        <Alert severity="success" icon={<CheckCircleIcon />}>
          {done}
        </Alert>
      )}

      {preview && (
        <Card>
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
              <Chip label={`строк ${preview.total}`} />
              <Chip color="success" label={`будет создано ${preview.to_create}`} />
              <Chip color="info" label={`обновлено ${preview.to_update}`} />
              {preview.invalid > 0 && (
                <Chip color="error" icon={<ErrorIcon />} label={`с ошибками ${preview.invalid}`} />
              )}
            </Stack>

            {preview.invalid > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Строки с ошибками будут пропущены — остальные загрузятся. Исправьте файл и
                загрузите заново, если нужны все.
              </Alert>
            )}

            <TableContainer sx={{ overflowX: 'auto', maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Строка</TableCell>
                    {preview.columns.map((column) => (
                      <TableCell key={column.key}>{column.title}</TableCell>
                    ))}
                    <TableCell>Что будет</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.rows.slice(0, 200).map((row) => (
                    <TableRow
                      key={row.line}
                      hover
                      sx={{ bgcolor: row.errors.length ? 'error.light' : undefined }}
                    >
                      <TableCell>{row.line}</TableCell>
                      {preview.columns.map((column) => (
                        <TableCell key={column.key}>{row.values[column.key] || '—'}</TableCell>
                      ))}
                      <TableCell>
                        {row.errors.length ? (
                          <Typography variant="caption" color="error">
                            {row.errors.join('; ')}
                          </Typography>
                        ) : (
                          <Chip
                            size="small"
                            label={row.action === 'update' ? 'обновить' : 'создать'}
                            color={row.action === 'update' ? 'info' : 'success'}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {preview.rows.length > 200 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Показаны первые 200 строк из {preview.total}. Загрузятся все.
              </Typography>
            )}

            <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                onClick={runApply}
                disabled={upload.isPending || preview.valid === 0}
              >
                Загрузить {preview.valid} строк
              </Button>
              <Button onClick={reset}>Отмена</Button>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  )
}
