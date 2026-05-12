/**
 * TanStack Query hook — GET /series
 *
 * Returns all economic indicator series, optionally filtered by category.
 * Uses queryOptions for composable query key + fn definition.
 */

import { queryOptions, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema'

export type SeriesRead = components['schemas']['SeriesRead']
export type SeriesListResponse = components['schemas']['SeriesListResponse']

export function seriesQueryOptions(category?: string) {
  return queryOptions({
    queryKey: ['series', { category: category ?? null }],
    queryFn: async (): Promise<SeriesListResponse> => {
      const { data, error } = await apiClient.GET('/series', {
        params: { query: { category: category ?? null } },
      })
      if (error) throw new Error(String(error))
      if (!data) throw new Error('Empty response from GET /series')
      return data
    },
    staleTime: 60_000,
  })
}

/**
 * Hook: list all series (optionally filtered by category).
 */
export function useSeries(category?: string) {
  return useQuery(seriesQueryOptions(category))
}
