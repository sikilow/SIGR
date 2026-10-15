// PROVISIONAL: modelo de dominio pendiente de validar con el equipo de API.

/** Roles del sistema. Por ahora solo se construye la interfaz de `mesero`. */
export type Rol = 'gerente' | 'mesero' | 'cocinero' | 'cajero' | 'hostess'

export interface Usuario {
  id: number
  nombre: string
  rol: Rol
}

/** Datos que se envían al iniciar sesión. */
export interface Credenciales {
  usuario: string
  contrasena: string
}
