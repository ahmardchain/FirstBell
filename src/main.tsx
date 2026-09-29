import * as React from 'react'
import { createRoot } from 'react-dom/client'
import FloatingIconsHeroDemo from './demo'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FloatingIconsHeroDemo />
  </React.StrictMode>,
)
