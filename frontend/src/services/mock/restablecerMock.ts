// Enlaces simulados para crear contraseña (modo demostración). Igual que la API: un solo uso, caducan en 1 hora,
// máximo 3 por usuario por hora y pedir uno nuevo invalida los anteriores. No se manda correo: el enlace se devuelve.
import { ErrorServicio } from '../errores'
import { baseDatos } from './baseDatos'

export const MINUTOS_ENLACE = 60
const MAXIMO_POR_HORA = 3

interface EnlaceMock {
  idUsuario: number
  creado: number
  expira: number
  usado: boolean
}
const enlaces = new Map<string, EnlaceMock>()

function tokenAleatorio(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Crea el enlace; `null` si ya se mandaron demasiados en la última hora. */
export function crearEnlaceMock(idUsuario: number, ahora = Date.now()): string | null {
  const recientes = [...enlaces.values()].filter((e) => e.idUsuario === idUsuario && ahora - e.creado < 3_600_000)
  if (recientes.length >= MAXIMO_POR_HORA) return null
  for (const e of enlaces.values()) if (e.idUsuario === idUsuario) e.usado = true
  const token = tokenAleatorio()
  enlaces.set(token, { idUsuario, creado: ahora, expira: ahora + MINUTOS_ENLACE * 60_000, usado: false })
  return `/restablecer?token=${token}`
}

export function usuarioDeEnlaceMock(token: string, ahora = Date.now()) {
  const e = enlaces.get(token)
  const u =
    e && !e.usado && e.expira > ahora
      ? baseDatos.usuarios.find((x) => x.idUsuario === e.idUsuario && x.activo !== false)
      : undefined
  if (!e || !u) {
    throw new ErrorServicio('enlace_invalido', 'El enlace ya se usó o caducó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».', 410)
  }
  return u
}

export function usarEnlaceMock(token: string, contrasena: string): void {
  const usuario = usuarioDeEnlaceMock(token)
  usuario.contrasena = contrasena
  for (const e of enlaces.values()) if (e.idUsuario === usuario.idUsuario) e.usado = true
}

export function enmascararCorreo(correo: string): string {
  const [usuario, dominio] = correo.split('@')
  if (!usuario || !dominio) return '***'
  return `${usuario[0]}***@${dominio}`
}

/** Solo para pruebas. */
export function reiniciarEnlacesMock(): void {
  enlaces.clear()
}
