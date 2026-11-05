import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Vite replaces DEV at build time, so production bundles do not contain this
// dashboard even if VITE_STORAGE_ENABLED was accidentally enabled at deployment.
const StorageDashboard = import.meta.env.DEV && import.meta.env.VITE_STORAGE_ENABLED === 'true'
  ? React.lazy(() => import('./StorageDashboard'))
  : null
const storagePath = window.location.pathname === '/storage' || window.location.pathname.startsWith('/storage/')
const localDevelopment = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
const storageRoute = ['/storage', '/storage/auth/callback'].includes(window.location.pathname)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {storagePath
      ? localDevelopment && storageRoute && StorageDashboard
        ? <React.Suspense fallback={<p role="status">Loading your tasks…</p>}><StorageDashboard /></React.Suspense>
        : <main><h1>Page not found</h1><a href="/">Go to InboxToTask</a></main>
      : <App />}
  </React.StrictMode>,
)
