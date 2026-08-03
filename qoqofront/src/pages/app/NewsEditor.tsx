import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PushPinIcon from '@mui/icons-material/PushPin'
import UploadIcon from '@mui/icons-material/Upload'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { api, errorMessage, mediaUrl } from '../../api/client'
import type { NewsPost, Page, PostCategory } from '../../api/types'
import { formatDate } from '../../lib/format'

const CATEGORIES: { value: PostCategory; label: string }[] = [
  { value: 'news', label: 'Новость' },
  { value: 'promo', label: 'Акция' },
  { value: 'announcement', label: 'Объявление' },
]

const EMPTY: Partial<NewsPost> = {
  title: '',
  summary: '',
  body: '',
  cover_url: null,
  category: 'news',
  is_published: false,
  is_pinned: false,
}

export function NewsEditor() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<Partial<NewsPost> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['news', 'admin'],
    queryFn: async () =>
      (await api.get<Page<NewsPost>>('/news', { params: { published_only: false, limit: 100 } }))
        .data,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['news'] })

  const save = useMutation({
    mutationFn: async (post: Partial<NewsPost>) => {
      const values = {
        title: post.title,
        summary: post.summary || null,
        body: post.body || null,
        cover_url: post.cover_url || null,
        category: post.category ?? 'news',
        is_published: post.is_published ?? false,
        is_pinned: post.is_pinned ?? false,
        valid_until: post.valid_until || null,
      }
      return post.id ? api.put(`/news/${post.id}`, values) : api.post('/news', values)
    },
    onSuccess: () => {
      refresh()
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/news/${id}`),
    onSuccess: refresh,
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return (await api.post<{ url: string }>('/content/upload', body)).data
    },
    onSuccess: (result) => setEditing((current) => ({ ...current, cover_url: result.url })),
  })

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography color="text.secondary" variant="body2" sx={{ flexGrow: 1 }}>
          Опубликованные записи выводятся на главной. Черновики видны только здесь.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
          Запись
        </Button>
      </Stack>

      {data?.items.length === 0 && (
        <Typography color="text.secondary">Записей пока нет.</Typography>
      )}

      {data?.items.map((post) => (
        <Card key={post.id}>
          <CardContent>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              {post.cover_url && (
                <Box
                  component="img"
                  src={mediaUrl(post.cover_url)}
                  alt=""
                  sx={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 1 }}
                />
              )}
              <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="h6">{post.title}</Typography>
                  <Chip size="small" label={post.category_title} />
                  <Chip
                    size="small"
                    color={post.is_published ? 'success' : 'default'}
                    label={post.is_published ? 'опубликовано' : 'черновик'}
                  />
                  {post.is_pinned && <PushPinIcon fontSize="small" color="secondary" />}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {post.summary}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(post.published_at ?? post.created_at)}
                </Typography>
              </Box>
              <IconButton onClick={() => setEditing(post)}>
                <EditIcon />
              </IconButton>
              <IconButton color="error" onClick={() => remove.mutate(post.id)}>
                <DeleteIcon />
              </IconButton>
            </Stack>
          </CardContent>
        </Card>
      ))}

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{editing?.id ? 'Изменить запись' : 'Новая запись'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Заголовок"
              value={editing?.title ?? ''}
              onChange={(event) => setEditing({ ...editing, title: event.target.value })}
              required
              fullWidth
            />
            <TextField
              select
              label="Тип"
              value={editing?.category ?? 'news'}
              onChange={(event) =>
                setEditing({ ...editing, category: event.target.value as PostCategory })
              }
              fullWidth
            >
              {CATEGORIES.map((category) => (
                <MenuItem key={category.value} value={category.value}>
                  {category.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Краткое описание"
              value={editing?.summary ?? ''}
              onChange={(event) => setEditing({ ...editing, summary: event.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
            <TextField
              label="Текст"
              value={editing?.body ?? ''}
              onChange={(event) => setEditing({ ...editing, body: event.target.value })}
              multiline
              minRows={4}
              fullWidth
            />

            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              {editing?.cover_url && (
                <Box
                  component="img"
                  src={mediaUrl(editing.cover_url)}
                  alt=""
                  sx={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 1 }}
                />
              )}
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
              >
                {editing?.cover_url ? 'Заменить обложку' : 'Загрузить обложку'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  setError(null)
                  try {
                    await upload.mutateAsync(file)
                  } catch (err) {
                    setError(errorMessage(err, 'Не удалось загрузить изображение'))
                  } finally {
                    if (fileRef.current) fileRef.current.value = ''
                  }
                }}
              />
            </Stack>

            <Stack direction="row" spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(editing?.is_published)}
                    onChange={(event) =>
                      setEditing({ ...editing, is_published: event.target.checked })
                    }
                  />
                }
                label="Опубликовать"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(editing?.is_pinned)}
                    onChange={(event) => setEditing({ ...editing, is_pinned: event.target.checked })}
                  />
                }
                label="Закрепить"
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)}>Отмена</Button>
          <Button
            variant="contained"
            disabled={save.isPending || !editing?.title}
            onClick={async () => {
              setError(null)
              try {
                await save.mutateAsync(editing!)
              } catch (err) {
                setError(errorMessage(err, 'Не удалось сохранить запись'))
              }
            }}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
