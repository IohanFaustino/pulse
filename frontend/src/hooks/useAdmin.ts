/**
 * TanStack Query mutation hooks for admin endpoints.
 *
 *  - useExtractOne(): POST /admin/extract/{code} — single-series refresh
 *  - useBackfill():    POST /admin/backfill       — refresh all (or a list)
 *  - useRefreshCalendar(): POST /admin/refresh-calendar
 *
 * On success, all of these invalidate the relevant React Query caches so the
 * UI re-fetches fresh state.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema'

export type ExtractionResultResponse = components['schemas']['ExtractionResultResponse']
export type BackfillResult = components['schemas']['BackfillResult']
export type CalendarRefreshResult = components['schemas']['CalendarRefreshResult']

export function useExtractOne() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string): Promise<ExtractionResultResponse> => {
      const { data, error } = await apiClient.POST('/admin/extract/{code}', {
        params: { path: { code } },
      })
      if (error) throw new Error(String(error))
      if (!data) throw new Error('Empty response from POST /admin/extract/{code}')
      return data
    },
    onSuccess: (_data, code) => {
      qc.invalidateQueries({ queryKey: ['observations', code] })
      qc.invalidateQueries({ queryKey: ['series'] })
      qc.invalidateQueries({ queryKey: ['health'] })
    },
  })
}

export function useBackfill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (codes?: string[]): Promise<BackfillResult> => {
      const { data, error } = await apiClient.POST('/admin/backfill', {
        params: codes && codes.length > 0 ? { query: { codes } } : {},
      })
      if (error) throw new Error(String(error))
      if (!data) throw new Error('Empty response from POST /admin/backfill')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observations'] })
      qc.invalidateQueries({ queryKey: ['series'] })
      qc.invalidateQueries({ queryKey: ['health'] })
    },
  })
}

export function useRefreshCalendar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<CalendarRefreshResult> => {
      const { data, error } = await apiClient.POST('/admin/refresh-calendar')
      if (error) throw new Error(String(error))
      if (!data) throw new Error('Empty response from POST /admin/refresh-calendar')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['releases'] })
      qc.invalidateQueries({ queryKey: ['health'] })
    },
  })
}
