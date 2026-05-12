/**
 * Typed HTTP client for the API-extractor FastAPI backend.
 *
 * Built on openapi-fetch which generates a fully typed client from the
 * OpenAPI schema defined in schema.ts. All request/response types are
 * inferred automatically — no manual casting needed.
 *
 * Base URL resolution:
 *   - In Docker Compose (container): Vite proxy rewrites `/api/*` → `http://api:8000/*`
 *   - On host dev: Vite proxy rewrites `/api/*` → `http://localhost:8000/*`
 *   - VITE_API_BASE_PATH overrides the prefix if the proxy target changes
 *
 * Usage:
 *   import { apiClient } from '@/api/client'
 *   const { data, error } = await apiClient.GET('/health')
 */

import createClient from 'openapi-fetch'
import type { paths } from './schema'

/**
 * The base path used by the Vite proxy rewrite rule (vite.config.ts).
 * All requests to `${API_BASE_PATH}/*` are forwarded to the FastAPI service.
 */
const API_BASE_PATH = import.meta.env['VITE_API_BASE_PATH'] ?? '/api'

export const apiClient = createClient<paths>({
  baseUrl: API_BASE_PATH,
})
