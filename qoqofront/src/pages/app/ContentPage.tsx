import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteIcon from '@mui/icons-material/Delete'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'

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
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, errorMessage } from '../../api/client'
import { useContentBlocks } from '../../api/queries'
import type { BlockType, ContentBlock } from '../../api/types'
import { useT, type Dictionary } from '../../i18n'
import { NewsEditor } from './NewsEditor'

/** Какие поля показывать в редакторе для каждого типа блока. */
function blockFields(
  t: Dictionary,
): Record<BlockType, { key: string; label: string; multiline?: boolean }[]> {
  return {
    hero: [
      { key: 'lead', label: t.content.payload.lead, multiline: true },
      { key: 'cta_text', label: t.content.payload.ctaText },
      { key: 'cta_link', label: t.content.payload.ctaLink },
    ],
    features: [],
    catalog: [],
    about: [{ key: 'text', label: t.content.payload.text, multiline: true }],
    certificates: [],
    contacts: [
      { key: 'phone', label: t.content.payload.phone },
      { key: 'email', label: t.content.payload.email },
      { key: 'address', label: t.content.payload.address, multiline: true },
      { key: 'work_hours', label: t.content.payload.workHours },
      { key: 'legal_name', label: t.content.payload.legalName },
    ],
    cta: [
      { key: 'text', label: t.content.payload.text, multiline: true },
      { key: 'cta_text', label: t.content.payload.ctaText },
      { key: 'cta_link', label: t.content.payload.ctaLink },
    ],
    news: [],
  }
}

/** Списочные поля блока: массивы объектов или строк внутри payload. */
function blockLists(
  t: Dictionary,
): Record<BlockType, { key: string; label: string; columns: string[] } | null> {
  return {
    hero: { key: 'badges', label: t.content.lists.badges, columns: ['title', 'subtitle'] },
    features: {
      key: 'items',
      label: t.content.lists.features,
      columns: ['icon', 'title', 'subtitle'],
    },
    catalog: {
      key: 'items',
      label: t.content.lists.catalog,
      columns: ['title', 'count', 'image_url'],
    },
    about: { key: 'bullets', label: t.content.lists.bullets, columns: [] },
    certificates: { key: 'items', label: t.content.lists.certificates, columns: ['name', 'image_url'] },
    contacts: null,
    cta: null,
    news: null,
  }
}

const BLOCK_TYPES: BlockType[] = [
  'hero',
  'features',
  'catalog',
  'about',
  'certificates',
  'news',
  'contacts',
  'cta',
]

function BlockEditor({
  block,
  onClose,
  onSaved,
}: {
  block: ContentBlock
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(block.title ?? '')
  const [subtitle, setSubtitle] = useState(block.subtitle ?? '')
  const [payload, setPayload] = useState<Record<string, unknown>>(block.payload ?? {})
  const [error, setError] = useState<string | null>(null)
  const t = useT()

  const listConfig = blockLists(t)[block.block_type]
  const listItems = (Array.isArray(payload[listConfig?.key ?? '']) ? payload[listConfig!.key] : []) as
    | Record<string, string>[]
    | string[]

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        block_type: block.block_type,
        title: title || null,
        subtitle: subtitle || null,
        sort_order: block.sort_order,
        is_visible: block.is_visible,
        payload,
      }
      return block.id
        ? api.put(`/content/blocks/${block.id}`, values)
        : api.post('/content/blocks', values)
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  function updateList(next: unknown[]) {
    setPayload((current) => ({ ...current, [listConfig!.key]: next }))
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t.content.blockTypes[block.block_type]}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={t.content.heading}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            fullWidth
          />
          <TextField
            label={t.content.subheading}
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            fullWidth
          />

          {blockFields(t)[block.block_type].map((field) => (
            <TextField
              key={field.key}
              label={field.label}
              value={String(payload[field.key] ?? '')}
              onChange={(event) =>
                setPayload((current) => ({ ...current, [field.key]: event.target.value }))
              }
              multiline={field.multiline}
              minRows={field.multiline ? 3 : undefined}
              fullWidth
            />
          ))}

          {block.block_type === 'news' && (
            <Alert severity="info">{t.content.newsBlockHint}</Alert>
          )}

          {listConfig && (
            <>
              <Divider />
              <Stack direction="row" sx={{ alignItems: 'center' }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  {listConfig.label}
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() =>
                    updateList([
                      ...(listItems as unknown[]),
                      listConfig.columns.length === 0
                        ? ''
                        : Object.fromEntries(listConfig.columns.map((column) => [column, ''])),
                    ])
                  }
                >
                  {t.common.add}
                </Button>
              </Stack>

              {(listItems as unknown[]).map((item, index) => (
                <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{ flexGrow: 1, display: 'grid', gap: 1 }}>
                    {listConfig.columns.length === 0 ? (
                      <TextField
                        label={t.content.listItem(index + 1)}
                        value={String(item)}
                        onChange={(event) => {
                          const next = [...(listItems as string[])]
                          next[index] = event.target.value
                          updateList(next)
                        }}
                        fullWidth
                      />
                    ) : (
                      listConfig.columns.map((column) => (
                        <TextField
                          key={column}
                          label={column}
                          value={String((item as Record<string, string>)[column] ?? '')}
                          onChange={(event) => {
                            const next = [...(listItems as Record<string, string>[])]
                            next[index] = { ...next[index], [column]: event.target.value }
                            updateList(next)
                          }}
                          fullWidth
                        />
                      ))
                    )}
                  </Box>
                  <IconButton
                    onClick={() =>
                      updateList((listItems as unknown[]).filter((_, i) => i !== index))
                    }
                    aria-label={t.common.delete}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Stack>
              ))}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t.common.cancel}</Button>
        <Button
          variant="contained"
          disabled={save.isPending}
          onClick={async () => {
            setError(null)
            try {
              await save.mutateAsync()
            } catch (err) {
              setError(errorMessage(err, t.content.saveFailed))
            }
          }}
        >
          {t.common.save}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function BlocksTab() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: blocks = [] } = useContentBlocks(true)
  const [editing, setEditing] = useState<ContentBlock | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newType, setNewType] = useState<BlockType>('cta')

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['content'] })

  const patch = useMutation({
    mutationFn: async ({ block, values }: { block: ContentBlock; values: Partial<ContentBlock> }) =>
      api.put(`/content/blocks/${block.id}`, {
        block_type: block.block_type,
        title: block.title,
        subtitle: block.subtitle,
        sort_order: block.sort_order,
        is_visible: block.is_visible,
        payload: block.payload,
        ...values,
      }),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/content/blocks/${id}`),
    onSuccess: refresh,
  })

  function move(index: number, direction: -1 | 1) {
    const target = blocks[index + direction]
    const current = blocks[index]
    if (!target) return
    // Меняем порядок местами — сервер отдаёт блоки отсортированными.
    patch.mutate({ block: current, values: { sort_order: target.sort_order } })
    patch.mutate({ block: target, values: { sort_order: current.sort_order } })
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography color="text.secondary" variant="body2" sx={{ flexGrow: 1 }}>
          {t.content.blocksHint}
        </Typography>
        <Button href="/" target="_blank" startIcon={<OpenInNewIcon />} size="small">
          {t.content.openSite}
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          {t.content.sectionButton}
        </Button>
      </Stack>

      {blocks.map((block, index) => (
        <Card key={block.id}>
          <CardContent>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="h6">
                    {block.title || t.content.blockTypes[block.block_type]}
                  </Typography>
                  <Chip size="small" label={t.content.blockTypes[block.block_type]} />
                  {!block.is_visible && <Chip size="small" color="default" label={t.content.hidden} />}
                </Stack>
                {block.subtitle && (
                  <Typography variant="body2" color="text.secondary">
                    {block.subtitle}
                  </Typography>
                )}
              </Box>

              <Tooltip title={t.common.moveUp}>
                <span>
                  <IconButton disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUpwardIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={t.common.moveDown}>
                <span>
                  <IconButton
                    disabled={index === blocks.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownwardIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={block.is_visible ? t.common.hide : t.common.show}>
                <IconButton
                  onClick={() => patch.mutate({ block, values: { is_visible: !block.is_visible } })}
                >
                  {block.is_visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
                </IconButton>
              </Tooltip>
              <Button onClick={() => setEditing(block)}>{t.content.editAction}</Button>
              <Tooltip title={t.content.deleteSection}>
                <IconButton color="error" onClick={() => remove.mutate(block.id)}>
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </CardContent>
        </Card>
      ))}

      {editing && (
        <BlockEditor block={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t.content.addSection}</DialogTitle>
        <DialogContent>
          <TextField
            select
            label={t.content.sectionType}
            value={newType}
            onChange={(event) => setNewType(event.target.value as BlockType)}
            sx={{ mt: 1 }}
            fullWidth
          >
            {BLOCK_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {t.content.blockTypes[type]}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)}>{t.common.cancel}</Button>
          <Button
            variant="contained"
            onClick={() => {
              setAddOpen(false)
              setEditing({
                id: '',
                block_type: newType,
                block_type_title: t.content.blockTypes[newType],
                title: '',
                subtitle: '',
                sort_order: (blocks.at(-1)?.sort_order ?? 0) + 10,
                is_visible: true,
                payload: {},
              })
            }}
          >
            {t.content.create}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export function ContentPage() {
  const [tab, setTab] = useState(0)
  const t = useT()

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">{t.content.title}</Typography>
        <Typography color="text.secondary" variant="body2">
          {t.content.pageSubtitle}
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(_, value: number) => setTab(value)}>
        <Tab label={t.content.tabs.blocks} />
        <Tab label={t.content.tabs.news} />
      </Tabs>

      {tab === 0 ? <BlocksTab /> : <NewsEditor />}
    </Stack>
  )
}
