import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'

import { useT } from '../../../i18n'
import { buildReferences } from './config'

export function ReferencesIndexPage() {
  const t = useT()
  const references = buildReferences(t)

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">{t.references.title}</Typography>
        <Typography color="text.secondary">{t.references.subtitle}</Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
        }}
      >
        {references.map((reference) => (
          <Card key={reference.resource}>
            <CardActionArea component={RouterLink} to={`/app/refs/${reference.resource}`}>
              <CardContent>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6">{reference.title}</Typography>
                    {reference.description && (
                      <Typography variant="body2" color="text.secondary">
                        {reference.description}
                      </Typography>
                    )}
                  </Box>
                  <ChevronRightIcon color="action" />
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Stack>
  )
}
