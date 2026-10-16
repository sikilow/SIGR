import vue from '@vitejs/plugin-vue'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Se leen todas las variables (prefijo '') para poder usar API_PROXY_TARGET.
  const env = loadEnv(mode, process.cwd(), '')
  const prefijoApi = env.VITE_API_URL?.startsWith('/') ? env.VITE_API_URL : '/api'

  return {
    plugins: [vue()],
    // Pruebas automáticas (npm test): solo lógica pura y servicios simulados, sin navegador.
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
    server: {
      // Proxy opcional: solo se activa si se define API_PROXY_TARGET.
      // Conserva el prefijo `/api`, que forma parte de las rutas del backend.
      proxy: env.API_PROXY_TARGET
        ? {
            [prefijoApi]: {
              target: env.API_PROXY_TARGET,
              changeOrigin: true,
            },
          }
        : undefined,
    },
  }
})
