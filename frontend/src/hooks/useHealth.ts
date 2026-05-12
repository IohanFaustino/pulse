/**
 * TanStack Query hook — GET /health
 *
 * Returns system health and per-series freshness. The sidebar SyncIndicator
 * polls this endpoint every 30s.
 */

import { queryOptions, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema'

export type HealthResponse = components['schemas']['HealthResponse']
export type SeriesFreshness = components['schemas']['SeriesFreshness']

export const healthQueryOptions = queryOptions({
  queryKey: ['health'],
  queryFn: async (): Promise<HealthResponse> => {
    const { data, error } = await apiClient.GET('/health')
    if (error) throw new Error(String(error))
    if (!data) throw new Error('Empty response from GET /health')
    return data
  },
  staleTime: 15_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
})

export function useHealth() {
  return useQuery(healthQueryOptions)
}
