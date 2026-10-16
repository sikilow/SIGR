// Tipos del módulo del gerente: administración de usuarios, categorías, productos e inventario.
import type { Rol } from './usuario'

export interface UsuarioAdmin {
  /** usuario.id_usuario */
  idUsuario: number
  nombre: string
  correo: string
  /** credenciales.nombre_usuario: nombre para iniciar sesión (no es el nombre real). */
  nombreUsuario: string
  /** CALCULADO por la API (JOIN con rol.nombre), normalizado. */
  rol: Rol
  /** `false` = desactivado: ya no puede iniciar sesión, pero conserva su historial. */
  activo: boolean
  /** perfil_usuario.telefono (tabla fuera del alcance del mesero). */
  telefono: string | null
  /** usuario.creado_en */
  creadoEn: string
  /** credenciales.ultimo_acceso */
  ultimoAcceso: string | null
}

export interface NuevoUsuario {
  nombre: string
  correo: string
  nombreUsuario: string
  contrasena: string
  rol: Rol
  telefono?: string
}

/** Cualquier subconjunto de campos editables. */
export type CambioUsuario = Partial<Pick<UsuarioAdmin, 'nombre' | 'correo' | 'nombreUsuario' | 'rol' | 'activo' | 'telefono'>>

export interface CategoriaAdmin {
  /** categoria_menu.id_categoria */
  idCategoria: number
  nombre: string
  totalProductos: number
}

export interface ProductoAdmin {
  /** producto.id_producto */
  idProducto: number
  idCategoria: number
  categoria: string
  nombre: string
  descripcion: string
  /** Precio en pesos mexicanos (MXN). */
  precio: number
  /** El gerente lo tiene activo en el menú. */
  activo: boolean
  existencia: number
  stockMinimo: number
  /** Lo que ve el mesero: activo Y con existencia mayor a 0. */
  disponible: boolean
}

export interface NuevoProducto {
  idCategoria: number
  nombre: string
  descripcion: string
  precio: number
  activo: boolean
  existencia: number
  stockMinimo: number
}

export type CambioProducto = Partial<NuevoProducto>

/** Roles que el gerente puede asignar. */
export const ROLES_ASIGNABLES: readonly Rol[] = ['gerente', 'mesero', 'cocinero', 'cajero', 'hostess']

export const CONTRASENA_MIN = 6
export const CONTRASENA_MAX = 72
