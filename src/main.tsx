import * as React from 'react'
import { createRoot } from 'react-dom/client'
import FloatingIconsHeroDemo from './demo'
import FirstBellApp from './app'
import './styles.css'

const isApp = window.location.pathname.replace(/\/+$/, '') === '/app'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isApp ? <FirstBellApp /> : <FloatingIconsHeroDemo />}
  </React.StrictMode>,
)
