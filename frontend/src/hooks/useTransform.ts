/**
 * TanStack Query hook — POST /series/{code}/transform
 *
 * Two usage patterns:
 *   1. useTransformQuery(code, spec) — queryOptions-based; good for read-through caching
 *      keyed on (code, spec). Enabled only when spec is provided.
 *   2. useTransformMutation(code) — useMutation for imperative calls from TransformModal.
 */

import { queryOptions, useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema'

export type TransformRequest = components['schemas']['TransformRequest']
export type TransformResponse = components['schemas']['TransformResponse']

/** Locally typed TransformSpec for use throughout the frontend. */
export interface TransformSpec {
  op: string
  params?: Record<string, unknown>
}

// ── Query-based (read-through cache) ─────────────────────────────────────────

export function transformQueryOptions(code: string, spec: TransformSpec) {
  return queryOptions({
    queryKey: ['transform', code, spec],
    queryFn: async (): Promise<TransformResponse> => {
      const { data, error } = await apiClient.POST('/series/{code}/transform', {
        params: { path: { code } },
        body: {
          op: spec.op,
          params: (spec.params ?? {}) as Record<string, never>,
        },
      })
      if (error) throw new Error(String(error))
      if (!data) throw new Error(`Empty response from POST /series/${code}/transform`)
      return data
    },
    staleTime: 60_000,
    enabled: Boolean(code) && Boolean(spec.op),
  })
}

/**
 * Hook: fetch a transformed series (cached by (code, spec)).
 */
export function useTransformQuery(code: string, spec: TransformSpec | null) {
  return useQuery(
    spec
      ? transformQueryOptions(code, spec)
      : { queryKey: ['transform', code, null], queryFn: () => null, enabled: false },
  )
}

// ── Mutation-based (imperative, from TransformModal) ─────────────────────────

/**
 * Hook: imperatively apply a transform. Call `mutate({ op, params })`.
 */
export function useTransformMutation(code: string) {
  return useMutation({
    mutationFn: async (spec: TransformSpec): Promise<TransformResponse> => {
      const { data, error } = await apiClient.POST('/series/{code}/transform', {
        params: { path: { code } },
        body: {
          op: spec.op,
          params: (spec.params ?? {}) as Record<string, never>,
        },
      })
      if (error) throw new Error(String(error))
      if (!data) throw new Error(`Empty response from POST /series/${code}/transform`)
      return data
    },
  })
}
