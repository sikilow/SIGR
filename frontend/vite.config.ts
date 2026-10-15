import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Se leen todas las variables (prefijo '') para poder usar API_PROXY_TARGET.
  const env = loadEnv(mode, process.cwd(), '')
  const prefijoApi = env.VITE_API_URL?.startsWith('/') ? env.VITE_API_URL : '/api'

  return {
    plugins: [vue()],
    server: {
      // Proxy opcional: solo se activa si se define API_PROXY_TARGET.
      // Evita CORS en desarrollo; `/api/mesas` llega al destino como `/mesas`.
      proxy: env.API_PROXY_TARGET
        ? {
            [prefijoApi]: {
              target: env.API_PROXY_TARGET,
              changeOrigin: true,
              rewrite: (ruta: string) => ruta.slice(prefijoApi.length) || '/',
            },
          }
        : undefined,
    },
  }
})
