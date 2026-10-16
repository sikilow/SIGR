// Guarda el token (JWT) que devuelve POST /auth/login. Se usa sessionStorage: sobrevive a
// recargar la página, pero se pierde al cerrar la pestaña (igual que los borradores de pedido).
const CLAVE_TOKEN = 'sigr.token'

export function leerToken(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

export function guardarToken(token: string): void {
  try {
    sessionStorage.setItem(CLAVE_TOKEN, token)
  } catch {
    // Sin sessionStorage no se puede conservar la sesión al recargar.
  }
}

export function limpiarToken(): void {
  try {
    sessionStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // Nada que limpiar.
  }
}
