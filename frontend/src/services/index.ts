// Único punto donde se elige la implementación de los servicios.
// VITE_USE_MOCK=false usa la API real; cualquier otro valor (o ausente) usa el mock.
import { crearServiciosApi } from './api'
import type { Servicios } from './interfaces'

export type { Servicios } from './interfaces'
export { ErrorServicio } from './errores'
export type { CodigoError } from './errores'

export const usandoMock: boolean = import.meta.env.VITE_USE_MOCK !== 'false'

// El mock se importa de forma dinámica: con VITE_USE_MOCK=false (npm run build:api) esa rama queda
// descartada al compilar y los datos de demostración (usuarios, contraseña de prueba) no viajan en el build.
export const servicios: Servicios = usandoMock
  ? (await import('./mock')).crearServiciosMock()
  : crearServiciosApi()
