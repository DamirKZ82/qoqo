import { useQuery } from '@tanstack/react-query'

import { api } from './client'

export interface Health {
  status: string
  app: string
  version: string
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<Health> => {
      const { data } = await api.get<Health>('/health')
      return data
    },
  })
}
