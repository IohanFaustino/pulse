/**
 * TanStack Query hook — GET /series/{code}
 *
 * Fetches full metadata for a single economic indicator series.
 */

import { queryOptions, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema'

export type SeriesRead = components['schemas']['SeriesRead']

export function seriesOneQueryOptions(code: string) {
  return queryOptions({
    queryKey: ['series', code],
    queryFn: async (): Promise<SeriesRead> => {
      const { data, error } = await apiClient.GET('/series/{code}', {
        params: { path: { code } },
      })
      if (error) throw new Error(String(error))
      if (!data) throw new Error(`Empty response from GET /series/${code}`)
      return data
    },
    staleTime: 60_000,
    enabled: Boolean(code),
  })
}

/**
 * Hook: fetch metadata for one series by code.
 */
export function useSeriesOne(code: string) {
  return useQuery(seriesOneQueryOptions(code))
}
