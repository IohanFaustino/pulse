/**
 * App root — Phase 8a router shell.
 *
 * Provides:
 *   - QueryClientProvider (@tanstack/react-query v5)
 *   - BrowserRouter (react-router-dom v6)
 *   - Layout: Sidebar (fixed left) + main pane (right)
 *   - Routes: / → Painel, /indices → Índices, /calendario → Calendário, /metadados → Metadados
 *
 * Page content is stub-only in W4a; W4b agents fill each page.
 */

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Sidebar from '@/components/Sidebar'
import Painel from '@/pages/Painel'
import Indices from '@/pages/Indices'
import Calendario from '@/pages/Calendario'
import Metadados from '@/pages/Metadados'
import { useUiStore } from '@/stores/uiStore'
import styles from './App.module.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

// ── Theme sync ────────────────────────────────────────────────────────────────

/**
 * Synchronises the Zustand `theme` state to `document.documentElement`
 * data-theme attribute so CSS [data-theme="dark"] overrides activate.
 * Runs on mount and every time the user toggles the theme.
 */
function ThemeSync() {
  const theme = useUiStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  return null
}

// ── Layout ────────────────────────────────────────────────────────────────────

function Layout() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  )
}

// ── App shell ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Painel />} />
            <Route path="indices" element={<Indices />} />
            <Route path="calendario" element={<Calendario />} />
            <Route path="metadados" element={<Metadados />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
