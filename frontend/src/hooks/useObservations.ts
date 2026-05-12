/**
 * TanStack Query hook — GET /series/{code}/observations
 *
 * Fetches raw time-series observations for a series.
 * Supports optional date range (from/to) and row limit.
 */

import { queryOptions, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema'

export type ObservationListResponse = components['schemas']['ObservationListResponse']
export type ObservationRead = components['schemas']['ObservationRead']

export interface ObservationsParams {
  code: string
  from?: string
  to?: string
  limit?: number
}

export function observationsQueryOptions(params: ObservationsParams) {
  const { code, from, to, limit } = params
  return queryOptions({
    queryKey: ['observations', code, { from: from ?? null, to: to ?? null, limit: limit ?? null }],
    queryFn: async (): Promise<ObservationListResponse> => {
      const { data, error } = await apiClient.GET('/series/{code}/observations', {
        params: {
          path: { code },
          query: {
            from: from ?? null,
            to: to ?? null,
            limit: limit ?? 24,
          },
        },
      })
      if (error) throw new Error(String(error))
      if (!data) throw new Error(`Empty response from GET /series/${code}/observations`)
      return data
    },
    staleTime: 30_000,
    enabled: Boolean(code),
  })
}

/**
 * Hook: fetch observations for a series.
 * Default limit=24 for sparklines (24 most recent observations).
 */
export function useObservations(params: ObservationsParams) {
  return useQuery(observationsQueryOptions(params))
}
