// Administración simulada (usuarios, categorías, productos, inventario) para VITE_USE_MOCK=true.
// Los cambios se hacen sobre la misma "base de datos" en memoria que usa el mesero, así que un
// producto nuevo o un precio editado se ven en el menú del mesero. Se reinicia al recargar la página.
import { MESA_CAPACIDAD_MAX, MESA_NUMERO_MAX, MESA_ZONA_MAX, type CategoriaAdmin, type MesaAdmin, type ProductoAdmin, type SeccionAdmin, type UsuarioAdmin } from '../../types'
import { ErrorServicio } from '../errores'
import type { CatalogoService, UsuariosService } from '../interfaces'
import { baseDatos, type MesaGuardada } from './baseDatos'
import { conRetraso } from './utiles'

const duplicado = (campo: string) => new ErrorServicio('estado_invalido', `Ya existe otro usuario con ese ${campo}.`, 409)
const claveProducto = (texto: string) => texto.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
// Orden del catálogo `rol` (Gerente, Mesero, Cocinero, Cajero, Hostess): SUPOSICIÓN, no confirmada.
const ROL_ID = { gerente: 1, mesero: 2, cocinero: 3, cajero: 4, hostess: 5 } as const
const noExiste = (que: string) => new ErrorServicio('no_encontrado', `${que} no existe.`, 404)

// ---------- Usuarios ----------
interface DatosExtra {
  correo: string
  telefono: string | null
  creadoEn: Date
  ultimoAcceso: Date | null
}
const extra = new Map<number, DatosExtra>()

function datosExtra(id: number, usuario: string): DatosExtra {
  let d = extra.get(id)
  if (!d) {
    d = { correo: `${usuario}@sigr.com`, telefono: null, creadoEn: new Date(), ultimoAcceso: null }
    extra.set(id, d)
  }
  return d
}

function aAdmin(id: number): UsuarioAdmin {
  const u = baseDatos.usuarios.find((x) => x.idUsuario === id)
  if (!u) throw noExiste('El usuario')
  const e = datosExtra(u.idUsuario, u.nombreUsuario)
  return {
    idUsuario: u.idUsuario,
    nombre: u.nombre,
    correo: e.correo,
    nombreUsuario: u.nombreUsuario,
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
      return conRetraso(() => baseDatos.usuarios.map((u) => aAdmin(u.idUsuario)).sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre)))
    },

    crear(n) {
      return conRetraso(() => {
        if (baseDatos.usuarios.some((u) => u.nombreUsuario.toLowerCase() === n.nombreUsuario.trim().toLowerCase())) throw duplicado('nombre de usuario')
        if (baseDatos.usuarios.some((u) => datosExtra(u.idUsuario, u.nombreUsuario).correo.toLowerCase() === n.correo.trim().toLowerCase())) throw duplicado('correo')
        const id = Math.max(0, ...baseDatos.usuarios.map((u) => u.idUsuario)) + 1
        baseDatos.usuarios.push({
          idUsuario: id,
          idRol: ROL_ID[n.rol],
          nombre: n.nombre.trim(),
          correo: n.correo.trim(),
          rol: n.rol,
          nombreUsuario: n.nombreUsuario.trim(),
          contrasena: n.contrasena,
          activo: true,
        })
        extra.set(id, { correo: n.correo.trim(), telefono: n.telefono?.trim() || null, creadoEn: new Date(), ultimoAcceso: null })
        return aAdmin(id)
      })
    },

    actualizar(id, c) {
      return conRetraso(() => {
        const u = baseDatos.usuarios.find((x) => x.idUsuario === id)
        if (!u) throw noExiste('El usuario')
        const dejaDeSerGerente = u.rol === 'gerente' && u.activo !== false && ((c.activo === false) || (c.rol !== undefined && c.rol !== 'gerente'))
        if (dejaDeSerGerente) {
          if (id === idSesion()) throw new ErrorServicio('estado_invalido', 'No puedes desactivarte ni cambiarte el rol a ti mismo.', 409)
          const otros = baseDatos.usuarios.filter((x) => x.idUsuario !== id && x.rol === 'gerente' && x.activo !== false)
          if (otros.length === 0) throw new ErrorServicio('estado_invalido', 'Debe quedar al menos un gerente activo.', 409)
        }
        if (c.nombreUsuario !== undefined && baseDatos.usuarios.some((x) => x.idUsuario !== id && x.nombreUsuario.toLowerCase() === c.nombreUsuario!.trim().toLowerCase())) throw duplicado('nombre de usuario')
        const e = datosExtra(u.idUsuario, u.nombreUsuario)
        if (c.correo !== undefined && baseDatos.usuarios.some((x) => x.idUsuario !== id && datosExtra(x.idUsuario, x.nombreUsuario).correo.toLowerCase() === c.correo!.trim().toLowerCase())) throw duplicado('correo')
        if (c.nombre !== undefined) u.nombre = c.nombre.trim()
        if (c.nombreUsuario !== undefined) u.nombreUsuario = c.nombreUsuario.trim()
        if (c.rol !== undefined) u.rol = c.rol
        if (c.activo !== undefined) u.activo = c.activo
        if (c.correo !== undefined) e.correo = c.correo.trim()
        if (c.telefono !== undefined) e.telefono = c.telefono?.trim() || null
        return aAdmin(id)
      })
    },

    cambiarContrasena(id, contrasena) {
      return conRetraso(() => {
        const u = baseDatos.usuarios.find((x) => x.idUsuario === id)
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
  /** false = se prepara al momento: sin existencia que controlar. */
  controla: boolean
}
const inventario = new Map<number, Inventario>()

function inv(id: number, disponible: boolean): Inventario {
  let i = inventario.get(id)
  if (!i) {
    // En la demo controlan existencia los productos del menú que ya traen `existencia`.
    const inicial = baseDatos.categorias.flatMap((c) => c.productos).find((x) => x.idProducto === id)?.existencia
    i = { existencia: inicial ?? (disponible ? 50 : 0), stockMinimo: 5, controla: inicial !== undefined }
    inventario.set(id, i)
  }
  return i
}

function aProductoAdmin(id: number): ProductoAdmin {
  for (const c of baseDatos.categorias) {
    const p = c.productos.find((x) => x.idProducto === id)
    if (p) {
      const activo = activos.get(p.idProducto) ?? p.disponible
      const i = inv(p.idProducto, activo)
      return {
        idProducto: p.idProducto,
        idCategoria: c.idCategoria,
        categoria: c.nombre,
        nombre: p.nombre,
        presentacion: p.presentacion ?? '',
        descripcion: p.descripcion,
        precio: p.precio,
        activo,
        existencia: i.existencia,
        stockMinimo: i.stockMinimo,
        controlaExistencia: i.controla,
        disponible: activo && (!i.controla || i.existencia > 0),
      }
    }
  }
  throw noExiste('El producto')
}

/** En el mock, `Producto.disponible` es lo que ve el mesero: activo Y con existencia. */
function sincronizarDisponible(id: number): void {
  for (const c of baseDatos.categorias) {
    const p = c.productos.find((x) => x.idProducto === id)
    if (p) {
      // `activo` vive en un mapa aparte para no perderlo cuando la existencia llega a 0.
      const admin = aProductoAdmin(id)
      p.disponible = admin.disponible
      if (admin.controlaExistencia) p.existencia = admin.existencia
      else delete p.existencia
    }
  }
}
const activos = new Map<number, boolean>()

function aCategoria(id: number): CategoriaAdmin {
  const c = baseDatos.categorias.find((x) => x.idCategoria === id)
  if (!c) throw noExiste('La categoría')
  return { idCategoria: c.idCategoria, nombre: c.nombre, totalProductos: c.productos.length }
}

function validarNombreCategoria(nombre: string, id?: number): void {
  if (baseDatos.categorias.some((c) => c.idCategoria !== id && c.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
    throw new ErrorServicio('estado_invalido', 'Ya existe una categoría con ese nombre.', 409)
  }
}

// ---------- Mesas ----------
const aMesaAdmin = (m: MesaGuardada): MesaAdmin => {
  const zona = m.zona?.trim()
  if (!zona) throw new ErrorServicio('desconocido', `La mesa ${m.numero} no tiene una sección registrada.`)
  return {
    idMesa: m.idMesa,
    numero: m.numero,
    capacidad: m.capacidad,
    zona,
    plantaBaja: m.plantaBaja,
    espacioCarriola: m.espacioCarriola,
    sinEscaleras: m.sinEscaleras,
    activa: m.activa,
    estado: m.estado,
  }
}

const claveSeccion = (nombre: string) => nombre.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()

function aSeccionAdmin(nombre: string): SeccionAdmin {
  const seccion = baseDatos.secciones.find((s) => s.nombre === nombre)
  if (!seccion) throw noExiste('La sección')
  return {
    nombre: seccion.nombre,
    activa: seccion.activa,
    totalMesas: baseDatos.mesas.filter((m) => m.zona === nombre).length,
  }
}

function validarNombreSeccion(nombre: string, actual?: string): void {
  const texto = nombre.trim()
  if (!texto || texto.length > MESA_ZONA_MAX) {
    throw new ErrorServicio('estado_invalido', `El nombre de la sección debe tener entre 1 y ${MESA_ZONA_MAX} caracteres.`, 422)
  }
  if (baseDatos.secciones.some((s) => s.nombre !== actual && claveSeccion(s.nombre) === claveSeccion(texto))) {
    throw new ErrorServicio('estado_invalido', 'Ya existe una sección con ese nombre.', 409)
  }
}

function exigirSeccionActiva(nombre: string): void {
  const seccion = baseDatos.secciones.find((s) => s.nombre === nombre.trim())
  if (!seccion || !seccion.activa) throw new ErrorServicio('estado_invalido', `La sección «${nombre}» no existe o está inhabilitada.`, 409)
}

/** Mismas reglas que valida el backend (`controllers/catalogo.ts`). */
function validarDatosMesa(c: {
  numero?: number
  capacidad?: number
  zona?: string
  plantaBaja?: boolean
  espacioCarriola?: boolean
  sinEscaleras?: boolean
}): void {
  if (c.numero !== undefined && (!Number.isInteger(c.numero) || c.numero < 1 || c.numero > MESA_NUMERO_MAX)) {
    throw new ErrorServicio('estado_invalido', `El número de mesa debe ser un entero de 1 a ${MESA_NUMERO_MAX}.`, 422)
  }
  if (c.capacidad !== undefined && (!Number.isInteger(c.capacidad) || c.capacidad < 1 || c.capacidad > MESA_CAPACIDAD_MAX)) {
    throw new ErrorServicio('estado_invalido', `La capacidad debe ser un entero de 1 a ${MESA_CAPACIDAD_MAX} personas.`, 422)
  }
  if (c.zona !== undefined && (!c.zona.trim() || c.zona.trim().length > MESA_ZONA_MAX)) {
    throw new ErrorServicio('estado_invalido', `La sección es obligatoria y admite máximo ${MESA_ZONA_MAX} caracteres.`, 422)
  }
}

function exigirNumeroLibre(numero: number, exceptoId?: number): void {
  if (baseDatos.mesas.some((m) => m.numero === numero && m.idMesa !== exceptoId)) {
    throw new ErrorServicio('estado_invalido', `Ya existe la mesa ${numero}.`, 409)
  }
}

export function crearCatalogoMock(): CatalogoService {
  // Los productos agotados de la demo cuentan como "activos sin existencia" salvo que se indique otra cosa.
  return {
    obtenerConfiguracionReservacion() {
      return conRetraso(() => ({ ...baseDatos.configuracionReservacion }))
    },

    actualizarConfiguracionReservacion(cambio) {
      return conRetraso(() => {
        if (!Number.isInteger(cambio.toleranciaMinutos) || cambio.toleranciaMinutos < 5 || cambio.toleranciaMinutos > 180) {
          throw new ErrorServicio('estado_invalido', 'La tolerancia debe estar entre 5 y 180 minutos.', 422)
        }
        if (!Number.isInteger(cambio.recordatorioMinutos) || cambio.recordatorioMinutos < 1 || cambio.recordatorioMinutos > 30) {
          throw new ErrorServicio('estado_invalido', 'El recordatorio debe estar entre 1 y 30 minutos.', 422)
        }
        baseDatos.configuracionReservacion = { ...cambio }
        return { ...baseDatos.configuracionReservacion }
      })
    },

    listarCategorias() {
      return conRetraso(() => baseDatos.categorias.map((c) => aCategoria(c.idCategoria)))
    },

    listarSecciones() {
      return conRetraso(() => baseDatos.secciones
        .map((s) => aSeccionAdmin(s.nombre))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    },

    crearSeccion(nombre) {
      return conRetraso(() => {
        validarNombreSeccion(nombre)
        const nueva = { nombre: nombre.trim(), activa: true }
        baseDatos.secciones.push(nueva)
        return aSeccionAdmin(nueva.nombre)
      })
    },

    renombrarSeccion(nombre, nuevoNombre) {
      return conRetraso(() => {
        const seccion = baseDatos.secciones.find((s) => s.nombre === nombre)
        if (!seccion) throw noExiste('La sección')
        validarNombreSeccion(nuevoNombre, nombre)
        const anterior = seccion.nombre
        seccion.nombre = nuevoNombre.trim()
        for (const mesa of baseDatos.mesas) {
          if (mesa.zona === anterior) mesa.zona = seccion.nombre
        }
        return aSeccionAdmin(seccion.nombre)
      })
    },

    actualizarSeccion(nombre, cambio) {
      return conRetraso(() => {
        const seccion = baseDatos.secciones.find((s) => s.nombre === nombre)
        if (!seccion) throw noExiste('La sección')
        if (!cambio.activa && seccion.activa) {
          const ocupada = baseDatos.mesas.find((m) =>
            m.zona === nombre &&
            (m.estado !== 'libre' ||
              baseDatos.cuentas.some((c) => c.idMesa === m.idMesa && c.estado !== 'cerrada') ||
              baseDatos.reservaciones.some((r) => r.idMesa === m.idMesa && (r.estado === 'pendiente' || r.estado === 'confirmada'))),
          )
          if (ocupada) {
            throw new ErrorServicio('estado_invalido', `No se puede inhabilitar «${nombre}» mientras la mesa ${ocupada.numero} esté ocupada, tenga una cuenta abierta o una reservación vigente.`, 409)
          }
        }
        seccion.activa = cambio.activa
        return aSeccionAdmin(nombre)
      })
    },

    eliminarSeccion(nombre) {
      return conRetraso(() => {
        const seccion = baseDatos.secciones.find((s) => s.nombre === nombre)
        if (!seccion) throw noExiste('La sección')
        const totalMesas = baseDatos.mesas.filter((m) => m.zona === nombre).length
        if (totalMesas > 0) {
          throw new ErrorServicio('estado_invalido', `No se puede borrar «${nombre}» mientras tenga mesas asignadas.`, 409)
        }
        baseDatos.secciones.splice(baseDatos.secciones.indexOf(seccion), 1)
      })
    },

    listarMesas() {
      return conRetraso(() => [...baseDatos.mesas].sort((a, b) => a.numero - b.numero).map(aMesaAdmin))
    },

    crearMesa(mesa) {
      return conRetraso(() => {
        validarDatosMesa(mesa)
        exigirSeccionActiva(mesa.zona)
        exigirNumeroLibre(mesa.numero)
        const nueva: MesaGuardada = {
          idMesa: Math.max(0, ...baseDatos.mesas.map((m) => m.idMesa)) + 1,
          numero: mesa.numero,
          capacidad: mesa.capacidad,
          zona: mesa.zona.trim(),
          plantaBaja: mesa.plantaBaja ?? false,
          espacioCarriola: mesa.espacioCarriola ?? false,
          sinEscaleras: mesa.sinEscaleras ?? false,
          activa: mesa.activa,
          estado: 'libre',
        }
        baseDatos.mesas.push(nueva)
        return aMesaAdmin(nueva)
      })
    },

    actualizarMesa(id, cambio) {
      return conRetraso(() => {
        const mesa = baseDatos.mesas.find((m) => m.idMesa === id)
        if (!mesa) throw noExiste('La mesa')
        if (Object.keys(cambio).length === 0) throw new ErrorServicio('estado_invalido', 'No hay nada que cambiar.', 422)
        validarDatosMesa(cambio)
        if (cambio.zona !== undefined) exigirSeccionActiva(cambio.zona)

        if (cambio.activa === false && mesa.activa) {
          if (mesa.estado !== 'libre') {
            throw new ErrorServicio('estado_invalido', `La mesa ${mesa.numero} está ${mesa.estado}: libérala antes de marcarla como no disponible.`, 409)
          }
          if (baseDatos.cuentas.some((c) => c.idMesa === id && c.estado !== 'cerrada')) {
            throw new ErrorServicio('estado_invalido', `La mesa ${mesa.numero} tiene una cuenta abierta: hay que cerrarla antes.`, 409)
          }
          if (baseDatos.reservaciones.some((r) => r.idMesa === id && (r.estado === 'pendiente' || r.estado === 'confirmada'))) {
            throw new ErrorServicio('estado_invalido', `La mesa ${mesa.numero} tiene reservaciones vigentes: cancélalas o cámbialas de mesa antes.`, 409)
          }
        }
        if (cambio.numero !== undefined) exigirNumeroLibre(cambio.numero, id)

        if (cambio.numero !== undefined) mesa.numero = cambio.numero
        if (cambio.capacidad !== undefined) mesa.capacidad = cambio.capacidad
        if (cambio.zona !== undefined) mesa.zona = cambio.zona.trim()
        if (cambio.plantaBaja !== undefined) mesa.plantaBaja = cambio.plantaBaja
        if (cambio.espacioCarriola !== undefined) mesa.espacioCarriola = cambio.espacioCarriola
        if (cambio.sinEscaleras !== undefined) mesa.sinEscaleras = cambio.sinEscaleras
        if (cambio.activa !== undefined) mesa.activa = cambio.activa
        return aMesaAdmin(mesa)
      })
    },

    crearCategoria(nombre) {
      return conRetraso(() => {
        validarNombreCategoria(nombre)
        const id = Math.max(0, ...baseDatos.categorias.map((c) => c.idCategoria)) + 1
        baseDatos.categorias.push({ idCategoria: id, nombre: nombre.trim(), productos: [] })
        return aCategoria(id)
      })
    },

    renombrarCategoria(id, nombre) {
      return conRetraso(() => {
        validarNombreCategoria(nombre, id)
        const c = baseDatos.categorias.find((x) => x.idCategoria === id)
        if (!c) throw noExiste('La categoría')
        c.nombre = nombre.trim()
        return aCategoria(id)
      })
    },

    eliminarCategoria(id) {
      return conRetraso(() => {
        const c = baseDatos.categorias.find((x) => x.idCategoria === id)
        if (!c) throw noExiste('La categoría')
        if (c.productos.length > 0) {
          throw new ErrorServicio('estado_invalido', `La categoría tiene ${c.productos.length} producto(s). Muévelos a otra categoría o desactívalos antes de borrarla.`, 409)
        }
        baseDatos.categorias.splice(baseDatos.categorias.indexOf(c), 1)
      })
    },

    listarProductos() {
      return conRetraso(() => baseDatos.categorias.flatMap((c) => c.productos.map((p) => aProductoAdmin(p.idProducto))))
    },

    crearProducto(n) {
      return conRetraso(() => {
        const c = baseDatos.categorias.find((x) => x.idCategoria === n.idCategoria)
        if (!c) throw new ErrorServicio('estado_invalido', 'La categoría indicada no existe.', 422)
        const nombre = claveProducto(n.nombre)
        const presentacion = claveProducto(n.presentacion)
        const existente = c.productos.find((p) => claveProducto(p.nombre) === nombre && claveProducto(p.presentacion ?? '') === presentacion)
        if (existente) {
          throw new ErrorServicio('estado_invalido', 'Ya existe un producto con esa categoría, nombre y presentación. Búscalo y edita sus datos o existencias.', 409)
        }
        const id = Math.max(0, ...baseDatos.categorias.flatMap((k) => k.productos.map((p) => p.idProducto))) + 1
        c.productos.push({ idProducto: id, idCategoria: c.idCategoria, nombre: n.nombre.trim(), presentacion: n.presentacion.trim(), descripcion: n.descripcion.trim(), precio: n.precio, disponible: n.activo && (!n.controlaExistencia || n.existencia > 0), ...(n.controlaExistencia ? { existencia: n.existencia } : {}) })
        activos.set(id, n.activo)
        inventario.set(id, { existencia: n.existencia, stockMinimo: n.stockMinimo, controla: n.controlaExistencia })
        return aProductoAdmin(id)
      })
    },

    actualizarProducto(id, c) {
      return conRetraso(() => {
        const actual = aProductoAdmin(id)
        const origen = baseDatos.categorias.find((k) => k.idCategoria === actual.idCategoria)!
        const p = origen.productos.find((x) => x.idProducto === id)!
        const categoria = c.idCategoria ?? actual.idCategoria
        const nombre = claveProducto(c.nombre ?? actual.nombre)
        const presentacion = claveProducto(c.presentacion ?? actual.presentacion)
        const existente = baseDatos.categorias
          .find((k) => k.idCategoria === categoria)
          ?.productos.find((otro) => otro.idProducto !== id && claveProducto(otro.nombre) === nombre && claveProducto(otro.presentacion ?? '') === presentacion)
        if (existente) {
          throw new ErrorServicio('estado_invalido', 'Ya existe otro producto con la misma categoría, nombre y presentación.', 409)
        }
        if (c.idCategoria !== undefined && c.idCategoria !== actual.idCategoria) {
          const destino = baseDatos.categorias.find((k) => k.idCategoria === c.idCategoria)
          if (!destino) throw new ErrorServicio('estado_invalido', 'La categoría indicada no existe.', 422)
          origen.productos.splice(origen.productos.indexOf(p), 1)
          p.idCategoria = destino.idCategoria
          destino.productos.push(p)
        }
        if (c.nombre !== undefined) p.nombre = c.nombre.trim()
        if (c.presentacion !== undefined) p.presentacion = c.presentacion.trim()
        if (c.descripcion !== undefined) p.descripcion = c.descripcion.trim()
        if (c.precio !== undefined) p.precio = c.precio
        const i = inv(id, actual.activo)
        if (c.existencia !== undefined) i.existencia = c.existencia
        if (c.stockMinimo !== undefined) i.stockMinimo = c.stockMinimo
        if (c.controlaExistencia !== undefined) i.controla = c.controlaExistencia
        activos.set(id, c.activo ?? activos.get(id) ?? actual.activo)
        sincronizarDisponible(id)
        return aProductoAdmin(id)
      })
    },
  }
}
