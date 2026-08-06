import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'

import { api, mediaUrl } from '../../api/client'
import type { CatalogGroup, CatalogProduct } from '../../api/types'
import { useLanguage, useT } from '../../i18n'
import { PublicLayout } from './PublicLayout'

/**
 * Название и тексты на выбранном языке.
 *
 * Казахские варианты лежат в translations рядом с русскими, как у новостей и
 * блоков главной. Нет перевода — показываем русский: пустая карточка хуже
 * непереведённой.
 */
export function localized(product: CatalogProduct, language: string) {
  const перевод = (product.translations?.[language] ?? {}) as Partial<CatalogProduct>
  return {
    name: перевод.name || product.name,
    description: перевод.description || product.description,
    composition: перевод.composition || product.composition,
    shelf_life: перевод.shelf_life || product.shelf_life,
    storage: перевод.storage || product.storage,
    pack: перевод.pack || product.pack,
  }
}

function ProductCard({ product }: { product: CatalogProduct }) {
  const { language } = useLanguage()
  const t = useT()
  const текст = localized(product, language)
  const фото = mediaUrl(product.image_url)

  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea
        component={RouterLink}
        to={`/products/${product.slug ?? product.id}`}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
      >
        <Box
          sx={{
            aspectRatio: '4 / 3',
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {фото ? (
            <Box
              component="img"
              src={фото}
              alt={текст.name}
              loading="lazy"
              // Вписываем целиком, а не заполняем кадр: у товара важна
              // упаковка, а обрезка съедает как раз её края.
              sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 1 }}
            />
          ) : (
            // Без фотографии карточка не должна ломать сетку: держим ту же
            // высоту и показываем название.
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              {t.products.noPhoto}
            </Typography>
          )}
        </Box>

        <CardContent sx={{ flexGrow: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>{текст.name}</Typography>
          {текст.pack && (
            <Typography variant="body2" color="text.secondary">
              {текст.pack}
            </Typography>
          )}
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ alignItems: 'center', mt: 1, color: 'primary.main' }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t.products.more}
            </Typography>
            <ArrowForwardIcon sx={{ fontSize: 16 }} />
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

export function ProductsPage() {
  const t = useT()

  const { data, isPending } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => (await api.get<CatalogGroup[]>('/catalog')).data,
  })

  return (
    <PublicLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        <Typography variant="h1" sx={{ mb: 1 }}>
          {t.products.title}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          {t.products.subtitle}
        </Typography>

        {isPending && (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={280} />
            ))}
          </Box>
        )}

        {data?.length === 0 && (
          <Typography color="text.secondary">{t.products.empty}</Typography>
        )}

        <Stack spacing={6}>
          {data?.map((group) => (
            <Box key={group.id ?? 'other'}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mb: 2 }}>
                <Typography variant="h2">{group.name}</Typography>
                <Chip size="small" label={group.products.length} />
              </Stack>
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                }}
              >
                {group.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      </Container>
    </PublicLayout>
  )
}
