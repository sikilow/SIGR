/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API (absoluta o relativa, p. ej. `/api`). */
  readonly VITE_API_URL?: string
  /** `false` para usar la API real; cualquier otro valor (o ausente) usa el mock. */
  readonly VITE_USE_MOCK?: string
  /** Intervalo de actualización automática del Panel de mesas, en ms (por defecto 10000). */
  readonly VITE_POLL_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
