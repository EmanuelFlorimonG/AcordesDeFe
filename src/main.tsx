import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './app/Root.tsx'
import { captureRecovery } from './auth/recovery'
import { installPrintLightMode } from './utils/printLight'
import { registerPwa } from './pwa'

// The link from a password recovery mail arrives with Supabase's answer in
// the fragment. It is read and cleared here, before the router ever looks at
// the hash, so no token is ever a route and none of them stays in the address.
captureRecovery()

// Imprimir en modo oscuro daba letra clara sobre papel blanco. Se arregla
// aquí, una vez, para todas las pantallas que se imprimen.
installPrintLightMode()

// Guarda la aplicación para que abra sin conexión. No guarda datos, y una
// versión nueva nunca toma el control por su cuenta (ver pwa.ts).
registerPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
