import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const StorageDashboard = React.lazy(() => import('./StorageDashboard'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {import.meta.env.VITE_STORAGE_ENABLED === 'true' && window.location.pathname === '/storage'
      ? <React.Suspense fallback={<p role="status">Loading your tasks…</p>}><StorageDashboard /></React.Suspense> : <App />}
  </React.StrictMode>,
)
