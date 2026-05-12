/**
 * TanStack Query hook — GET /releases
 *
 * Fetches release calendar events, optionally filtered by month (YYYY-MM)
 * and/or category.
 */

import { queryOptions, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema'

export type ReleaseListResponse = components['schemas']['ReleaseListResponse']
export type ReleaseRead = components['schemas']['ReleaseRead']

export interface ReleasesParams {
  month?: string   // YYYY-MM
  category?: string
}

export function releasesQueryOptions(params: ReleasesParams = {}) {
  const { month, category } = params
  return queryOptions({
    queryKey: ['releases', { month: month ?? null, category: category ?? null }],
    queryFn: async (): Promise<ReleaseListResponse> => {
      const { data, error } = await apiClient.GET('/releases', {
        params: {
          query: {
            month: month ?? null,
            category: category ?? null,
          },
        },
      })
      if (error) throw new Error(String(error))
      if (!data) throw new Error('Empty response from GET /releases')
      return data
    },
    staleTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Hook: fetch release calendar events.
 */
export function useReleases(params: ReleasesParams = {}) {
  return useQuery(releasesQueryOptions(params))
}
