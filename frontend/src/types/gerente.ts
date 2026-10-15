// Tipos del módulo del gerente: administración de usuarios, categorías, productos e inventario.
import type { Rol } from './usuario'

export interface UsuarioAdmin {
  id: number
  nombre: string
  correo: string
  /** Nombre de usuario para iniciar sesión (no es el nombre real). */
  usuario: string
  rol: Rol
  /** `false` = desactivado: ya no puede iniciar sesión, pero conserva su historial. */
  activo: boolean
  telefono: string | null
  creadoEn: string
  ultimoAcceso: string | null
}

export interface NuevoUsuario {
  nombre: string
  correo: string
  usuario: string
  contrasena: string
  rol: Rol
  telefono?: string
}

/** Cualquier subconjunto de campos editables. */
export type CambioUsuario = Partial<Pick<UsuarioAdmin, 'nombre' | 'correo' | 'usuario' | 'rol' | 'activo' | 'telefono'>>

export interface CategoriaAdmin {
  id: number
  nombre: string
  totalProductos: number
}

export interface ProductoAdmin {
  id: number
  categoriaId: number
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
  categoriaId: number
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
