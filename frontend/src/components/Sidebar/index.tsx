/**
 * Sidebar — fixed left-side navigation.
 *
 * Expands to 280px, collapses to 72px icon-only rail.
 * State (collapsed/expanded) comes from useUiStore (Zustand).
 *
 * Nav items per design doc §2:
 *   Painel (/) · Índices (/indices) · Calendário (/calendario) · Metadados (/metadados)
 *
 * Active item: gradient grafite background, sky accent bar, +6px translate (expanded only).
 * Hover: rgba(255,255,255,0.06) bg + icon white.
 * Toggle button: chevron rotates 180deg on collapse (320ms cubic-bezier).
 * Recents: last 3 series from useUserPrefs.
 * Footer: pulsing dot (2.4s opacity loop) + "sincronizado · agora".
 *
 * Toolbar (between nav + recents):
 *   - Theme toggle: sun (light) / moon (dark) icon
 *   - Lang toggle: PT / EN pills
 *
 * Icon system: inline SVG per route, 20×20px, stroke 1.75px, color via currentColor.
 * Collapsed: icon centred in 72px rail; label + hint hidden via opacity.
 * Active collapsed: icon color = --accent-3 (sky), accent bar visible.
 * Inactive: icon color = rgba(255,255,255,0.55).
 * Hover: icon color = white.
 */

import { NavLink, useLocation } from 'react-router-dom'
import styles from './Sidebar.module.css'
import { useUiStore } from '@/stores/uiStore'
import { useTranslation } from '@/lib/i18n'
import SyncIndicator from '@/components/SyncIndicator'

/**
 * Stable nav item definition. `id` is used for testid generation and never
 * changes regardless of the current display language.
 */
interface NavItem {
  /** Route path */
  to: string
  /** Stable id for data-testid (does NOT change with language) */
  id: string
  /** i18n key for the label */
  labelKey: string
  /** i18n key for the hint */
  hintKey: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',           id: 'painel',     labelKey: 'sidebar.nav.label.painel',     hintKey: 'sidebar.nav.hint.painel' },
  { to: '/indices',    id: 'índices',    labelKey: 'sidebar.nav.label.indices',    hintKey: 'sidebar.nav.hint.indices' },
  { to: '/calendario', id: 'calendário', labelKey: 'sidebar.nav.label.calendario', hintKey: 'sidebar.nav.hint.calendario' },
  { to: '/metadados',  id: 'metadados',  labelKey: 'sidebar.nav.label.metadados',  hintKey: 'sidebar.nav.hint.metadados' },
]

/** Inline SVG icons — 20×20 viewport, stroke-only, color via currentColor. */
function NavIcon({ route }: { route: string }) {
  const shared = {
    width: 20,
    height: 20,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  }

  switch (route) {
    // Painel — 2×2 squares grid
    case '/':
      return (
        <svg {...shared}>
          <rect x="3"  y="3"  width="6" height="6" rx="1" />
          <rect x="11" y="3"  width="6" height="6" rx="1" />
          <rect x="3"  y="11" width="6" height="6" rx="1" />
          <rect x="11" y="11" width="6" height="6" rx="1" />
        </svg>
      )

    // Índices — 3 horizontal lines (list)
    case '/indices':
      return (
        <svg {...shared}>
          <line x1="3" y1="6"  x2="17" y2="6"  />
          <line x1="3" y1="10" x2="17" y2="10" />
          <line x1="3" y1="14" x2="17" y2="14" />
        </svg>
      )

    // Calendário — square with top bar (calendar)
    case '/calendario':
      return (
        <svg {...shared}>
          <rect x="3" y="4" width="14" height="13" rx="1.5" />
          <line x1="3"  y1="8"  x2="17" y2="8"  />
          <line x1="7"  y1="2"  x2="7"  y2="6"  />
          <line x1="13" y1="2"  x2="13" y2="6"  />
        </svg>
      )

    // Metadados — document rectangle with text lines
    case '/metadados':
      return (
        <svg {...shared}>
          <rect x="4" y="2" width="12" height="16" rx="1.5" />
          <line x1="7"  y1="7"  x2="13" y2="7"  />
          <line x1="7"  y1="10" x2="13" y2="10" />
          <line x1="7"  y1="13" x2="11" y2="13" />
        </svg>
      )

    default:
      return null
  }
}

/** Sun icon — indicates light mode (click to go dark). */
function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable={false}
    >
      <circle cx="10" cy="10" r="3.5" />
      <line x1="10" y1="1.5" x2="10" y2="3.5" />
      <line x1="10" y1="16.5" x2="10" y2="18.5" />
      <line x1="1.5" y1="10" x2="3.5" y2="10" />
      <line x1="16.5" y1="10" x2="18.5" y2="10" />
      <line x1="4.1" y1="4.1" x2="5.5" y2="5.5" />
      <line x1="14.5" y1="14.5" x2="15.9" y2="15.9" />
      <line x1="14.5" y1="5.5" x2="15.9" y2="4.1" />
      <line x1="4.1" y1="15.9" x2="5.5" y2="14.5" />
    </svg>
  )
}

/** Moon icon — indicates dark mode (click to go light). */
function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable={false}
    >
      <path d="M17 12.5A7 7 0 0 1 8 3a7 7 0 1 0 9 9.5z" />
    </svg>
  )
}

export default function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggle = useUiStore((s) => s.toggleSidebar)
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const lang = useUiStore((s) => s.lang)
  const setLang = useUiStore((s) => s.setLang)
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <aside
      className={[styles.sidebar, collapsed ? styles.collapsed : ''].filter(Boolean).join(' ')}
      data-collapsed={collapsed}
      data-testid="sidebar"
      aria-label="Navegação principal"
    >
      {/* Toggle button */}
      <button
        className={styles.toggleBtn}
        onClick={toggle}
        aria-label={collapsed ? t('sidebar.toggle.expand') : t('sidebar.toggle.collapse')}
        aria-expanded={!collapsed}
        data-testid="sidebar-toggle"
        type="button"
      >
        <span className={[styles.chevron, collapsed ? styles.collapsed : ''].filter(Boolean).join(' ')} aria-hidden="true">
          ‹
        </span>
      </button>

      {/* Brand */}
      <div className={styles.brand}>
        <span className={styles.brandName}>
          <svg
            className={styles.brandIcon}
            viewBox="0 0 32 16"
            width="32"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="0,8 6,8 9,3 13,13 17,5 21,11 25,8 32,8" />
          </svg>
          Pulse
        </span>
        <span className={styles.brandSub}>ECONOMIC INDICATORS</span>
      </div>

      {/* Nav */}
      <nav className={styles.nav} aria-label={t('sidebar.nav.aria')}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to)

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={[styles.navItem, isActive ? styles.active : ''].filter(Boolean).join(' ')}
              aria-current={isActive ? 'page' : undefined}
              data-testid={`nav-item-${item.id}`}
              end={item.to === '/'}
            >
              <span className={styles.navIcon}>
                <NavIcon route={item.to} />
              </span>
              <span className={styles.navText}>
                <span className={styles.navLabel}>{t(item.labelKey)}</span>
                <span className={styles.navHint}>{t(item.hintKey)}</span>
              </span>
            </NavLink>
          )
        })}
      </nav>

      {/* Theme + Language toggles */}
      <div className={styles.toolRow} data-testid="sidebar-tools">
        {/* Theme toggle — sun = light mode shown, click goes dark; moon = dark mode shown, click goes light */}
        <button
          className={styles.themeBtn}
          onClick={toggleTheme}
          aria-label={t('sidebar.theme.toggle')}
          aria-pressed={theme === 'dark'}
          data-testid="theme-toggle"
          type="button"
          title={t('sidebar.theme.toggle')}
        >
          {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
        </button>

        {/* Language pills — PT | EN */}
        <div className={styles.langPills} role="group" aria-label={t('sidebar.lang.toggle')} data-testid="lang-toggle">
          <button
            className={[styles.langPill, lang === 'pt' ? styles.langPillActive : ''].filter(Boolean).join(' ')}
            onClick={() => setLang('pt')}
            aria-pressed={lang === 'pt'}
            data-testid="lang-pt"
            type="button"
          >
            PT
          </button>
          <button
            className={[styles.langPill, lang === 'en' ? styles.langPillActive : ''].filter(Boolean).join(' ')}
            onClick={() => setLang('en')}
            aria-pressed={lang === 'en'}
            data-testid="lang-en"
            type="button"
          >
            EN
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <SyncIndicator />
      </footer>
    </aside>
  )
}
