// Lada = código de país del teléfono. Se guarda sin «+» (cliente.lada y perfil_usuario.lada). El teléfono se guarda
// aparte, solo con los dígitos nacionales; cuántos son depende del país.
//
// Esta tabla es la MISMA que usa el servidor (backend/src/utils/campos.ts, PAISES_LADA): si cambias una, cambia la otra.
// Una prueba (lada.test.ts) las compara.

export interface OpcionLada {
  /** Solo dígitos, sin «+» (lo que se guarda). */
  codigo: string
  pais: string
  /** Dígitos mínimos y máximos del número nacional (sin el código de país). */
  min: number
  max: number
}

export const LADA_PREDETERMINADA = '52'

export const LADAS: readonly OpcionLada[] = [
  { codigo: '52', pais: 'México', min: 10, max: 10 },
  { codigo: '1', pais: 'EE. UU. y Canadá', min: 10, max: 10 },
  { codigo: '54', pais: 'Argentina', min: 10, max: 11 },
  { codigo: '591', pais: 'Bolivia', min: 8, max: 8 },
  { codigo: '55', pais: 'Brasil', min: 10, max: 11 },
  { codigo: '56', pais: 'Chile', min: 9, max: 9 },
  { codigo: '86', pais: 'China', min: 11, max: 11 },
  { codigo: '57', pais: 'Colombia', min: 10, max: 10 },
  { codigo: '506', pais: 'Costa Rica', min: 8, max: 8 },
  { codigo: '593', pais: 'Ecuador', min: 9, max: 9 },
  { codigo: '503', pais: 'El Salvador', min: 8, max: 8 },
  { codigo: '34', pais: 'España', min: 9, max: 9 },
  { codigo: '33', pais: 'Francia', min: 9, max: 9 },
  { codigo: '49', pais: 'Alemania', min: 10, max: 13 },
  { codigo: '502', pais: 'Guatemala', min: 8, max: 8 },
  { codigo: '504', pais: 'Honduras', min: 8, max: 8 },
  { codigo: '507', pais: 'Panamá', min: 8, max: 8 },
  { codigo: '51', pais: 'Perú', min: 8, max: 9 },
  { codigo: '44', pais: 'Reino Unido', min: 10, max: 10 },
  { codigo: '598', pais: 'Uruguay', min: 8, max: 8 },
  { codigo: '58', pais: 'Venezuela', min: 10, max: 10 },
]

/** Texto de una opción: «México (+52)». */
export const etiquetaLada = (o: OpcionLada): string => `${o.pais} (+${o.codigo})`

/** Rango de dígitos de una lada; si no está en la tabla (otro país ya guardado), un rango amplio. */
export function rangoTelefono(lada: string): { min: number; max: number } {
  const pais = LADAS.find((o) => o.codigo === lada)
  return pais ? { min: pais.min, max: pais.max } : { min: 6, max: 14 }
}

/** «10 dígitos» o «de 10 a 13 dígitos». */
export function textoDigitos(lada: string): string {
  const { min, max } = rangoTelefono(lada)
  return min === max ? `${min} dígitos` : `de ${min} a ${max} dígitos`
}

/** Teléfono para mostrar: «+52 3115550201». Sin teléfono, `null`. */
export function textoTelefono(telefono: string | null | undefined, lada?: string | null): string | null {
  if (!telefono) return null
  return `+${lada || LADA_PREDETERMINADA} ${telefono}`
}

/** Las ladas que ofrece el selector; si el registro trae una que no está en la lista (otro país), se agrega para no perderla. */
export function opcionesLada(actual: string): readonly OpcionLada[] {
  return LADAS.some((o) => o.codigo === actual) || !/^\d{1,4}$/.test(actual)
    ? LADAS
    : [...LADAS, { codigo: actual, pais: 'Otro país', ...rangoTelefono(actual) }]
}
