import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // El service worker guarda la aplicación —y sólo la aplicación— para que
    // abra sin conexión. Nada de datos: el cancionero ya tiene su propia
    // copia local y los Setlists la suya, y duplicar eso aquí sería tener dos
    // verdades sobre lo mismo.
    VitePWA({
      // El manifiesto es el de `public/`, escrito a mano: el plugin no debe
      // generar otro ni pisarlo.
      manifest: false,
      // Ese manifiesto ya va enlazado desde index.html.
      injectManifest: undefined,
      // El registro se hace en `src/pwa.ts`, para saber cuándo la aplicación
      // quedó lista para trabajar sin conexión y cuándo hay una versión nueva.
      injectRegister: null,
      // "prompt", nunca "autoUpdate": una versión nueva no puede tomar el
      // control y recargar en mitad de una misa.
      registerType: 'prompt',
      workbox: {
        // Todo lo que el build produce, incluidos los `import()` diferidos:
        // sin ellos, abrir Modo Misa sin conexión fallaría al pedir su trozo.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest,ico}'],
        // Las rutas son hash, así que cualquier navegación es la raíz.
        navigateFallback: 'index.html',
        // Un service worker viejo no debe sobrevivir a uno nuevo.
        cleanupOutdatedCaches: true,
        // Sin `runtimeCaching` a propósito: ni Supabase ni YouTube pasan por
        // aquí. Lo que necesita red, la necesita de verdad.
      },
      devOptions: {
        // En desarrollo estorba: recargar con un service worker por medio
        // esconde los cambios que se acaban de hacer.
        enabled: false,
      },
    }),
  ],
})
