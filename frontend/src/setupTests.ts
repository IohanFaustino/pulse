/**
 * Vitest global setup — imported before every test file.
 * Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 */
import '@testing-library/jest-dom'

// jsdom does not implement window.matchMedia — stub it for prefers-reduced-motion checks.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
