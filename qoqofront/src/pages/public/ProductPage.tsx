import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink, useParams } from 'react-router-dom'

import { api, mediaUrl } from '../../api/client'
import type { CatalogProduct } from '../../api/types'
import { useLanguage, useT } from '../../i18n'
import { localized } from './ProductsPage'
import { PublicLayout } from './PublicLayout'

/** Строка характеристики. Пустые не показываем — они только удлиняют страницу. */
function Property({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography>{value}</Typography>
    </Box>
  )
}

export function ProductPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { language } = useLanguage()
  const t = useT()

  const { data, isPending, isError } = useQuery({
    queryKey: ['catalog', slug],
    queryFn: async () => (await api.get<CatalogProduct>(`/catalog/${slug}`)).data,
    retry: false,
  })

  const текст = data ? localized(data, language) : null
  const фото = mediaUrl(data?.image_url)

  return (
    <PublicLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        <Button component={RouterLink} to="/products" startIcon={<ArrowBackIcon />} sx={{ mb: 3 }}>
          {t.products.title}
        </Button>

        {isPending && <Skeleton variant="rounded" height={360} />}
        {isError && <Alert severity="warning">{t.products.notFound}</Alert>}

        {data && текст && (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 3, md: 6 }}>
            <Box
              sx={{
                flex: '0 0 auto',
                width: { xs: '100%', md: 420 },
                aspectRatio: '4 / 3',
                bgcolor: 'action.hover',
                borderRadius: 2,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {фото ? (
                <Box
                  component="img"
                  src={фото}
                  alt={текст.name}
                  sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 2 }}
                />
              ) : (
                <Typography color="text.secondary">{t.products.noPhoto}</Typography>
              )}
            </Box>

            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              {data.category_name && (
                <Typography variant="body2" color="text.secondary">
                  {data.category_name}
                </Typography>
              )}
              <Typography variant="h1" sx={{ mb: 2 }}>
                {текст.name}
              </Typography>

              {текст.description && (
                // Текст вводит человек в системе, поэтому переносы строк
                // сохраняем, а разметку не разбираем: чужой HTML на странице
                // сайта нам не нужен.
                <Typography sx={{ whiteSpace: 'pre-line', mb: 3 }}>{текст.description}</Typography>
              )}

              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                <Property label={t.products.pack} value={текст.pack} />
                <Property label={t.products.composition} value={текст.composition} />
                <Property label={t.products.shelfLife} value={текст.shelf_life} />
                <Property label={t.products.storage} value={текст.storage} />
                <Property label={t.products.unit} value={data.unit_name} />
              </Stack>
            </Box>
          </Stack>
        )}
      </Container>
    </PublicLayout>
  )
}
