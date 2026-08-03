import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { api, TOKEN_KEY } from '../api/client'
import { useCurrentUser } from '../api/queries'
import type { CurrentUser, UserRole } from '../api/types'

interface AuthContextValue {
  user: CurrentUser | undefined
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  setToken: (token: string) => void
  logout: () => void
  hasRole: (...roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const queryClient = useQueryClient()
  const { data: user, isLoading } = useCurrentUser(Boolean(token))

  const setToken = useCallback(
    (value: string) => {
      localStorage.setItem(TOKEN_KEY, value)
      setTokenState(value)
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    [queryClient],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<{ access_token: string }>('/auth/login', { email, password })
      setToken(data.access_token)
    },
    [setToken],
  )

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setTokenState(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: Boolean(token) && isLoading,
      isAuthenticated: Boolean(token) && Boolean(user),
      login,
      setToken,
      logout,
      hasRole: (...roles: UserRole[]) => Boolean(user && roles.includes(user.role)),
    }),
    [user, token, isLoading, login, setToken, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth должен вызываться внутри AuthProvider')
  }
  return context
}
