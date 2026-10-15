// Único punto donde se elige la implementación de los servicios.
// VITE_USE_MOCK=false usa la API real; cualquier otro valor (o ausente) usa el mock.
import { crearServiciosApi } from './api'
import type { Servicios } from './interfaces'
import { crearServiciosMock } from './mock'

export type { Servicios } from './interfaces'
export { ErrorServicio } from './errores'
export type { CodigoError } from './errores'

export const usandoMock: boolean = import.meta.env.VITE_USE_MOCK !== 'false'

export const servicios: Servicios = usandoMock ? crearServiciosMock() : crearServiciosApi()
