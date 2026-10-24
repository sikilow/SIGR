// Tipos del módulo del gerente: administración de usuarios, categorías, productos, inventario y mesas.
import type { EstadoMesa } from './estados'
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
  /** usuario.creado_en (DATETIME, hora local). */
  creadoEn: Date
  /** credenciales.ultimo_acceso (DATETIME, NULL si nunca entró). */
  ultimoAcceso: Date | null
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

export interface SeccionAdmin {
  nombre: string
  activa: boolean
  totalMesas: number
}

export interface ConfiguracionReservacion {
  toleranciaMinutos: number
  recordatorioMinutos: number
}

export interface ProductoAdmin {
  /** producto.id_producto */
  idProducto: number
  idCategoria: number
  categoria: string
  nombre: string
  presentacion: string
  descripcion: string
  /** Precio en pesos mexicanos (MXN). */
  precio: number
  /** El gerente lo tiene activo en el menú. */
  activo: boolean
  existencia: number
  stockMinimo: number
  /** `false` = se prepara al momento: no tiene existencia que controlar (el mesero puede pedir cualquier cantidad). */
  controlaExistencia: boolean
  /** Lo que ve el mesero: activo Y (no controla existencia, o existencia mayor a 0). */
  disponible: boolean
}

export interface NuevoProducto {
  idCategoria: number
  nombre: string
  presentacion: string
  descripcion: string
  precio: number
  activo: boolean
  controlaExistencia: boolean
  existencia: number
  stockMinimo: number
}

export type CambioProducto = Partial<NuevoProducto>

/** Mesa vista por el gerente: también las no disponibles (el panel del mesero y de la hostess solo muestra las disponibles). */
export interface MesaAdmin {
  /** mesa.id_mesa */
  idMesa: number
  /** mesa.numero: único; es el que se ve en el salón. */
  numero: number
  /** mesa.capacidad: cantidad de personas (mayor que 0). */
  capacidad: number
  /** mesa.zona: nombre de una sección registrada; es obligatoria en la base de datos. */
  zona: string
  plantaBaja: boolean
  espacioCarriola: boolean
  sinEscaleras: boolean
  /** mesa.activa: `false` = no disponible; desaparece del Salón y del Panel de mesas y no se puede sentar ni reservar. */
  activa: boolean
  /** mesa.estado: ocupación actual (libre, ocupada o reservada). */
  estado: EstadoMesa
}

export interface NuevaMesa {
  numero: number
  capacidad: number
  /** Sección activa del salón. */
  zona: string
  plantaBaja?: boolean
  espacioCarriola?: boolean
  sinEscaleras?: boolean
  activa: boolean
}

/** Cualquier subconjunto de campos editables. Marcar como no disponible = `{ activa: false }` (las mesas no se borran). */
export type CambioMesa = Partial<NuevaMesa>

/** Límites que valida también el backend. */
export const MESA_NUMERO_MAX = 999
export const MESA_CAPACIDAD_MAX = 50
export const MESA_ZONA_MAX = 40

/** Roles que el gerente puede asignar. */
export const ROLES_ASIGNABLES: readonly Rol[] = ['gerente', 'mesero', 'cocinero', 'cajero', 'hostess']

export const CONTRASENA_MIN = 6
export const CONTRASENA_MAX = 72
