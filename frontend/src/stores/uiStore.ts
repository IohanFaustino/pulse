/**
 * UI state store — Zustand 4 vanilla pattern.
 *
 * Stores UI-only state that is not persisted to the server:
 *   - sidebarCollapsed: whether the sidebar is in narrow (68px) mode
 *   - lastVisitedPage: last route path for sidebar highlight persistence
 *   - theme: 'light' | 'dark' — persisted in localStorage as "pulse:theme"
 *   - lang: 'pt' | 'en' — persisted in localStorage as "pulse:lang"
 *
 * On init:
 *   - theme reads localStorage["pulse:theme"]; falls back to
 *     prefers-color-scheme media query; defaults to 'light'.
 *   - lang reads localStorage["pulse:lang"]; defaults to 'pt'.
 */

import { create } from 'zustand'

export type Theme = 'light' | 'dark'
export type Lang = 'pt' | 'en'

// ── Init helpers ──────────────────────────────────────────────────────────────

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem('pulse:theme')
    if (stored === 'light' || stored === 'dark') return stored
    // Respect OS preference on first visit
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
  } catch {
    // localStorage may be unavailable (SSR, private mode, etc.)
  }
  return 'light'
}

function readLang(): Lang {
  try {
    const stored = localStorage.getItem('pulse:lang')
    if (stored === 'pt' || stored === 'en') return stored
  } catch {
    // ignore
  }
  return 'pt'
}

function persistTheme(t: Theme) {
  try { localStorage.setItem('pulse:theme', t) } catch { /* ignore */ }
}

function persistLang(l: Lang) {
  try { localStorage.setItem('pulse:lang', l) } catch { /* ignore */ }
}

// ── State interface ────────────────────────────────────────────────────────────

interface UiState {
  /** Whether the sidebar is collapsed to 68px icon-only mode. */
  sidebarCollapsed: boolean
  /** Toggle sidebar between expanded (280px) and collapsed (72px). */
  toggleSidebar: () => void
  /** Set collapsed state directly. */
  setSidebarCollapsed: (collapsed: boolean) => void

  /** Last visited page route path (e.g. '/', '/indices'). */
  lastVisitedPage: string
  /** Update the last visited page. */
  setLastVisitedPage: (path: string) => void

  /** Current colour theme. */
  theme: Theme
  /** Set theme explicitly and persist to localStorage. */
  setTheme: (t: Theme) => void
  /** Toggle between light and dark. */
  toggleTheme: () => void

  /** Current UI language. */
  lang: Lang
  /** Set language explicitly and persist to localStorage. */
  setLang: (l: Lang) => void
  /** Toggle between pt and en. */
  toggleLang: () => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useUiStore = create<UiState>((set, get) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  lastVisitedPage: '/',
  setLastVisitedPage: (path) => set({ lastVisitedPage: path }),

  theme: readTheme(),
  setTheme: (t) => {
    persistTheme(t)
    set({ theme: t })
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light'
    persistTheme(next)
    set({ theme: next })
  },

  lang: readLang(),
  setLang: (l) => {
    persistLang(l)
    set({ lang: l })
  },
  toggleLang: () => {
    const next: Lang = get().lang === 'pt' ? 'en' : 'pt'
    persistLang(next)
    set({ lang: next })
  },
}))
