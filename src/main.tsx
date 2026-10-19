import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyBridgeDeepLink, stripBridgeDeepLink } from './lib/bridgeSettings'

// A shared connection-profile link (#bridge=…&token=…) must be applied before
// the first render so the scanner picks up the bridge transport immediately.
if (applyBridgeDeepLink(window.location.href)) stripBridgeDeepLink()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
