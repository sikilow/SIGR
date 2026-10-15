// Administración simulada (usuarios, categorías, productos, inventario) para VITE_USE_MOCK=true.
// Los cambios se hacen sobre la misma "base de datos" en memoria que usa el mesero, así que un
// producto nuevo o un precio editado se ven en el menú del mesero. Se reinicia al recargar la página.
import type { CategoriaAdmin, ProductoAdmin, UsuarioAdmin } from '../../types'
import { ErrorServicio } from '../errores'
import type { CatalogoService, UsuariosService } from '../interfaces'
import { baseDatos } from './baseDatos'
import { conRetraso } from './utiles'

const duplicado = (campo: string) => new ErrorServicio('estado_invalido', `Ya existe otro usuario con ese ${campo}.`, 409)
const noExiste = (que: string) => new ErrorServicio('no_encontrado', `${que} no existe.`, 404)

// ---------- Usuarios ----------
interface DatosExtra {
  correo: string
  telefono: string | null
  creadoEn: string
  ultimoAcceso: string | null
}
const extra = new Map<number, DatosExtra>()

function datosExtra(id: number, usuario: string): DatosExtra {
  let d = extra.get(id)
  if (!d) {
    d = { correo: `${usuario}@sigr.com`, telefono: null, creadoEn: new Date().toISOString(), ultimoAcceso: null }
    extra.set(id, d)
  }
  return d
}

function aAdmin(id: number): UsuarioAdmin {
  const u = baseDatos.usuarios.find((x) => x.id === id)
  if (!u) throw noExiste('El usuario')
  const e = datosExtra(u.id, u.usuario)
  return {
    id: u.id,
    nombre: u.nombre,
    correo: e.correo,
    usuario: u.usuario,
    rol: u.rol,
    activo: u.activo !== false,
    telefono: e.telefono,
    creadoEn: e.creadoEn,
    ultimoAcceso: e.ultimoAcceso,
  }
}

/** El mock no tiene sesión de servidor: "quién soy" se lee de la sesión simulada (ver authMock). */
function idSesion(): number | null {
  try {
    const g = sessionStorage.getItem('sigr.mock.sesion')
    return g ? (JSON.parse(g) as { id: number }).id : null
  } catch {
    return null
  }
}

export function crearUsuariosMock(): UsuariosService {
  return {
    listar() {
      return conRetraso(() => baseDatos.usuarios.map((u) => aAdmin(u.id)).sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre)))
    },

    crear(n) {
      return conRetraso(() => {
        if (baseDatos.usuarios.some((u) => u.usuario.toLowerCase() === n.usuario.trim().toLowerCase())) throw duplicado('nombre de usuario')
        if (baseDatos.usuarios.some((u) => datosExtra(u.id, u.usuario).correo.toLowerCase() === n.correo.trim().toLowerCase())) throw duplicado('correo')
        const id = Math.max(0, ...baseDatos.usuarios.map((u) => u.id)) + 1
        baseDatos.usuarios.push({ id, nombre: n.nombre.trim(), rol: n.rol, usuario: n.usuario.trim(), contrasena: n.contrasena, activo: true })
        extra.set(id, { correo: n.correo.trim(), telefono: n.telefono?.trim() || null, creadoEn: new Date().toISOString(), ultimoAcceso: null })
        return aAdmin(id)
      })
    },

    actualizar(id, c) {
      return conRetraso(() => {
        const u = baseDatos.usuarios.find((x) => x.id === id)
        if (!u) throw noExiste('El usuario')
        const dejaDeSerGerente = u.rol === 'gerente' && u.activo !== false && ((c.activo === false) || (c.rol !== undefined && c.rol !== 'gerente'))
        if (dejaDeSerGerente) {
          if (id === idSesion()) throw new ErrorServicio('estado_invalido', 'No puedes desactivarte ni cambiarte el rol a ti mismo.', 409)
          const otros = baseDatos.usuarios.filter((x) => x.id !== id && x.rol === 'gerente' && x.activo !== false)
          if (otros.length === 0) throw new ErrorServicio('estado_invalido', 'Debe quedar al menos un gerente activo.', 409)
        }
        if (c.usuario !== undefined && baseDatos.usuarios.some((x) => x.id !== id && x.usuario.toLowerCase() === c.usuario!.trim().toLowerCase())) throw duplicado('nombre de usuario')
        const e = datosExtra(u.id, u.usuario)
        if (c.correo !== undefined && baseDatos.usuarios.some((x) => x.id !== id && datosExtra(x.id, x.usuario).correo.toLowerCase() === c.correo!.trim().toLowerCase())) throw duplicado('correo')
        if (c.nombre !== undefined) u.nombre = c.nombre.trim()
        if (c.usuario !== undefined) u.usuario = c.usuario.trim()
        if (c.rol !== undefined) u.rol = c.rol
        if (c.activo !== undefined) u.activo = c.activo
        if (c.correo !== undefined) e.correo = c.correo.trim()
        if (c.telefono !== undefined) e.telefono = c.telefono?.trim() || null
        return aAdmin(id)
      })
    },

    cambiarContrasena(id, contrasena) {
      return conRetraso(() => {
        const u = baseDatos.usuarios.find((x) => x.id === id)
        if (!u) throw noExiste('El usuario')
        u.contrasena = contrasena
      })
    },
  }
}

// ---------- Catálogo ----------
interface Inventario {
  existencia: number
  stockMinimo: number
}
const inventario = new Map<number, Inventario>()

function inv(id: number, disponible: boolean): Inventario {
  let i = inventario.get(id)
  if (!i) {
    i = { existencia: disponible ? 50 : 0, stockMinimo: 5 }
    inventario.set(id, i)
  }
  return i
}

function aProductoAdmin(id: number): ProductoAdmin {
  for (const c of baseDatos.categorias) {
    const p = c.productos.find((x) => x.id === id)
    if (p) {
      const activo = activos.get(p.id) ?? p.disponible
      const i = inv(p.id, activo)
      return {
        id: p.id,
        categoriaId: c.id,
        categoria: c.nombre,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio: p.precio,
        activo,
        existencia: i.existencia,
        stockMinimo: i.stockMinimo,
        disponible: activo && i.existencia > 0,
      }
    }
  }
  throw noExiste('El producto')
}

/** En el mock, `Producto.disponible` es lo que ve el mesero: activo Y con existencia. */
function sincronizarDisponible(id: number): void {
  for (const c of baseDatos.categorias) {
    const p = c.productos.find((x) => x.id === id)
    if (p) {
      // `activo` vive en un mapa aparte para no perderlo cuando la existencia llega a 0.
      p.disponible = aProductoAdmin(id).disponible
    }
  }
}
const activos = new Map<number, boolean>()

function aCategoria(id: number): CategoriaAdmin {
  const c = baseDatos.categorias.find((x) => x.id === id)
  if (!c) throw noExiste('La categoría')
  return { id: c.id, nombre: c.nombre, totalProductos: c.productos.length }
}

function validarNombreCategoria(nombre: string, id?: number): void {
  if (baseDatos.categorias.some((c) => c.id !== id && c.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
    throw new ErrorServicio('estado_invalido', 'Ya existe una categoría con ese nombre.', 409)
  }
}

export function crearCatalogoMock(): CatalogoService {
  // Los productos agotados de la demo cuentan como "activos sin existencia" salvo que se indique otra cosa.
  return {
    listarCategorias() {
      return conRetraso(() => baseDatos.categorias.map((c) => aCategoria(c.id)))
    },

    crearCategoria(nombre) {
      return conRetraso(() => {
        validarNombreCategoria(nombre)
        const id = Math.max(0, ...baseDatos.categorias.map((c) => c.id)) + 1
        baseDatos.categorias.push({ id, nombre: nombre.trim(), productos: [] })
        return aCategoria(id)
      })
    },

    renombrarCategoria(id, nombre) {
      return conRetraso(() => {
        validarNombreCategoria(nombre, id)
        const c = baseDatos.categorias.find((x) => x.id === id)
        if (!c) throw noExiste('La categoría')
        c.nombre = nombre.trim()
        return aCategoria(id)
      })
    },

    eliminarCategoria(id) {
      return conRetraso(() => {
        const c = baseDatos.categorias.find((x) => x.id === id)
        if (!c) throw noExiste('La categoría')
        if (c.productos.length > 0) {
          throw new ErrorServicio('estado_invalido', `La categoría tiene ${c.productos.length} producto(s). Muévelos a otra categoría o desactívalos antes de borrarla.`, 409)
        }
        baseDatos.categorias.splice(baseDatos.categorias.indexOf(c), 1)
      })
    },

    listarProductos() {
      return conRetraso(() => baseDatos.categorias.flatMap((c) => c.productos.map((p) => aProductoAdmin(p.id))))
    },

    crearProducto(n) {
      return conRetraso(() => {
        const c = baseDatos.categorias.find((x) => x.id === n.categoriaId)
        if (!c) throw new ErrorServicio('estado_invalido', 'La categoría indicada no existe.', 422)
        const id = Math.max(0, ...baseDatos.categorias.flatMap((k) => k.productos.map((p) => p.id))) + 1
        c.productos.push({ id, categoriaId: c.id, nombre: n.nombre.trim(), descripcion: n.descripcion.trim(), precio: n.precio, disponible: n.activo && n.existencia > 0 })
        activos.set(id, n.activo)
        inventario.set(id, { existencia: n.existencia, stockMinimo: n.stockMinimo })
        return aProductoAdmin(id)
      })
    },

    actualizarProducto(id, c) {
      return conRetraso(() => {
        const actual = aProductoAdmin(id)
        const origen = baseDatos.categorias.find((k) => k.id === actual.categoriaId)!
        const p = origen.productos.find((x) => x.id === id)!
        if (c.categoriaId !== undefined && c.categoriaId !== actual.categoriaId) {
          const destino = baseDatos.categorias.find((k) => k.id === c.categoriaId)
          if (!destino) throw new ErrorServicio('estado_invalido', 'La categoría indicada no existe.', 422)
          origen.productos.splice(origen.productos.indexOf(p), 1)
          p.categoriaId = destino.id
          destino.productos.push(p)
        }
        if (c.nombre !== undefined) p.nombre = c.nombre.trim()
        if (c.descripcion !== undefined) p.descripcion = c.descripcion.trim()
        if (c.precio !== undefined) p.precio = c.precio
        const i = inv(id, actual.activo)
        if (c.existencia !== undefined) i.existencia = c.existencia
        if (c.stockMinimo !== undefined) i.stockMinimo = c.stockMinimo
        activos.set(id, c.activo ?? activos.get(id) ?? actual.activo)
        sincronizarDisponible(id)
        return aProductoAdmin(id)
      })
    },
  }
}
