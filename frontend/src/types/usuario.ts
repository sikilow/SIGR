// Tipos `Usuario` y `Rol` (tablas `usuario`, `rol` y `credenciales`). Ver docs/equivalencias-bd.md.

/** Roles del sistema: `rol.nombre` normalizado (minúsculas, sin acentos). */
export const ROLES = ['gerente', 'mesero', 'cocinero', 'cajero', 'hostess'] as const
export type Rol = (typeof ROLES)[number]

export interface Usuario {
  /** usuario.id_usuario */
  idUsuario: number
  /** usuario.id_rol */
  idRol: number
  nombre: string
  correo: string
  activo: boolean
  /** CALCULADO por la API (JOIN con rol.nombre), normalizado. `null` si la API envía un rol que no se reconoce. */
  rol: Rol | null
}

/** Datos que se envían al iniciar sesión. */
export interface Credenciales {
  /** credenciales.nombre_usuario */
  nombreUsuario: string
  /** Texto que escribe la persona; la API lo compara con credenciales.password_hash. Nunca se guarda. */
  contrasena: string
}
