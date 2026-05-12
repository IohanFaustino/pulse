/**
 * TanStack Query hooks — GET + PATCH /user_prefs
 *
 * Provides:
 *   - useUserPrefs()       — query hook returning full UserPrefsRead
 *   - usePin(code)         — helper mutation: add a pin
 *   - useUnpin(code)       — helper mutation: remove a pin
 *   - useSetTransform(code, spec) — helper mutation: update card transform
 *   - useAddRecent(code)   — helper mutation: prepend to recents (max 3)
 */

import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema'
import type { TransformSpec } from './useTransform'

export type UserPrefsRead = components['schemas']['UserPrefsRead']
export type UserPrefsUpdate = components['schemas']['UserPrefsUpdate']

// ── Query ─────────────────────────────────────────────────────────────────────

export const userPrefsQueryOptions = queryOptions({
  queryKey: ['user_prefs'],
  queryFn: async (): Promise<UserPrefsRead> => {
    const { data, error } = await apiClient.GET('/user_prefs')
    if (error) throw new Error(String(error))
    if (!data) throw new Error('Empty response from GET /user_prefs')
    return data
  },
  staleTime: 30_000,
})

export function useUserPrefs() {
  return useQuery(userPrefsQueryOptions)
}

// ── Shared mutation helper ─────────────────────────────────────────────────────

function useUserPrefsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (update: UserPrefsUpdate): Promise<UserPrefsRead> => {
      const { data, error } = await apiClient.PATCH('/user_prefs', {
        body: update,
      })
      if (error) throw new Error(String(error))
      if (!data) throw new Error('Empty response from PATCH /user_prefs')
      return data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(userPrefsQueryOptions.queryKey, updated)
    },
  })
}

// ── Domain helpers ────────────────────────────────────────────────────────────

/** Pin a series (adds to Painel). */
export function usePin() {
  const mutation = useUserPrefsMutation()
  return {
    ...mutation,
    pin: (code: string) => mutation.mutate({ add_pins: [code] }),
  }
}

/** Unpin a series (removes from Painel). */
export function useUnpin() {
  const mutation = useUserPrefsMutation()
  return {
    ...mutation,
    unpin: (code: string) => mutation.mutate({ remove_pins: [code] }),
  }
}

/** Set (or clear) the card transform for a pinned series. */
export function useSetTransform() {
  const mutation = useUserPrefsMutation()
  return {
    ...mutation,
    setTransform: (code: string, spec: TransformSpec | null) =>
      mutation.mutate({
        card_transforms: {
          [code]: spec ? (spec as Record<string, never>) : null,
        },
      }),
  }
}

/** Add a series to recents (max 3, most recent first). */
export function useAddRecent() {
  const queryClient = useQueryClient()
  const mutation = useUserPrefsMutation()
  return {
    ...mutation,
    addRecent: (code: string) => {
      const existing = queryClient.getQueryData<UserPrefsRead>(
        userPrefsQueryOptions.queryKey,
      )
      const currentRecents = existing?.recents ?? []
      // Prepend code, deduplicate, keep max 3
      const next = [code, ...currentRecents.filter((c) => c !== code)].slice(0, 3)
      mutation.mutate({ recents: next })
    },
  }
}
