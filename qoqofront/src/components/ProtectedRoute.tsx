import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import type { UserRole } from '../api/types'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode
  roles?: UserRole[]
}) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}
