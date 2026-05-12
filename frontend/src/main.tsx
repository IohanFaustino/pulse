/**
 * Application entry point.
 *
 * React 18 StrictMode is enabled to surface potential issues early.
 * globals.css is imported here to ensure it is the first stylesheet
 * in the bundle and cannot be overridden by component CSS modules.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error(
    'Root element #root not found. Check index.html has <div id="root"></div>.'
  )
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
