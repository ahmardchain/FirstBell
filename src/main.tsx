import * as React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles.css'
import './motion.css'

const isApp = window.location.pathname.replace(/\/+$/, '') === '/app'
const FirstBellApp = React.lazy(() => import('./app-entry'))
const FloatingIconsHeroDemo = React.lazy(() => import('./demo'))

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={null}>{isApp ? <FirstBellApp /> : <FloatingIconsHeroDemo />}</React.Suspense>
  </React.StrictMode>,
)
