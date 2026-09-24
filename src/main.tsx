import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './app/Root.tsx'
import { captureRecovery } from './auth/recovery'

// The link from a password recovery mail arrives with Supabase's answer in
// the fragment. It is read and cleared here, before the router ever looks at
// the hash, so no token is ever a route and none of them stays in the address.
captureRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
