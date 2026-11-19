// Administración simulada (usuarios, categorías, productos, inventario) para VITE_USE_MOCK=true.
// Los cambios se hacen sobre la misma "base de datos" en memoria que usa el mesero, así que un
// producto nuevo o un precio editado se ven en el menú del mesero. Se reinicia al recargar la página.
import { validarHorario } from '../../utils/horarioReservacion'
import { rangoTelefono, textoDigitos } from '../../utils/lada'
import { MESA_CAPACIDAD_MAX, MESA_NUMERO_MAX, MESA_ZONA_MAX, type CaracteristicaAdmin, type CategoriaAdmin, type CategoriaMetodoPagoAdmin, type MetodoPagoAdmin, type Cliente, type ClienteAdmin, type MesaAdmin, type Producto, type ProductoAdmin, type SeccionAdmin, type UsuarioAdmin } from '../../types'
import { ErrorServicio } from '../errores'
import type { CatalogoService, ClientesService, UsuariosService } from '../interfaces'
import { baseDatos, type MesaGuardada } from './baseDatos'
import { categoriasMetodoPagoMock, metodosPagoMock } from './metodosPago'
import { conRetraso } from './utiles'
import { estaSinEntregar } from '../../utils/reglas'
import { crearEnlaceMock, enmascararCorreo } from './restablecerMock'

const duplicado = (campo: string) => new ErrorServicio('estado_invalido', `Ya existe otro usuario con ese ${campo}.`, 409)
const claveProducto = (texto: string) => texto.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
// Orden del catálogo `rol` (Gerente, Mesero, Cocinero, Cajero, Hostess): SUPOSICIÓN, no confirmada.
const ROL_ID = { gerente: 1, mesero: 2, cocinero: 3, cajero: 4, hostess: 5 } as const
const noExiste = (que: string) => new ErrorServicio('no_encontrado', `${que} no existe.`, 404)

// ---------- Usuarios ----------
interface DatosExtra {
  correo: string
  telefono: string | null
  lada: string
  creadoEn: Date
  ultimoAcceso: Date | null
}
const extra = new Map<number, DatosExtra>()
/** Usuarios eliminados (lógico) y cuándo; siguen en `baseDatos` para el historial, pero inactivos y ocultos. */
const usuariosEliminados = new Map<number, Date>()

function datosExtra(id: number, usuario: string): DatosExtra {
  let d = extra.get(id)
  if (!d) {
    d = { correo: `${usuario}@sigr.com`, telefono: null, lada: '52', creadoEn: new Date(), ultimoAcceso: null }
    extra.set(id, d)
  }
  return d
}

/** Misma regla que la API: teléfono opcional; si viene, 10 dígitos (acepta espacios, guiones y paréntesis) y no se repite. */
function telefonoValido(texto: string | null | undefined, idPropio?: number, lada = '52'): string | null {
  const limpio = (texto ?? '').trim().replace(/[\s().-]/g, '')
  if (limpio === '') return null
  const { min, max } = rangoTelefono(lada)
  if (!/^\d+$/.test(limpio) || limpio.length < min || limpio.length > max) {
    throw new ErrorServicio('estado_invalido', `El teléfono debe tener ${textoDigitos(lada)}.`, 422)
  }
  const repetido = baseDatos.usuarios.some(
    (u) => u.idUsuario !== idPropio && datosExtra(u.idUsuario, u.nombreUsuario).telefono === limpio,
  )
  if (repetido) throw duplicado('teléfono')
  return limpio
}

function aAdmin(id: number): UsuarioAdmin {
  const u = baseDatos.usuarios.find((x) => x.idUsuario === id)
  if (!u) throw noExiste('El usuario')
  const e = datosExtra(u.idUsuario, u.nombreUsuario)
  return {
    idUsuario: u.idUsuario,
    esPrimerGerente: baseDatos.usuarios
      .filter((candidato) => candidato.rol === 'gerente')
      .sort((a, b) => a.idUsuario - b.idUsuario)[0]?.idUsuario === u.idUsuario,
    nombre: u.nombre,
    correo: e.correo,
    nombreUsuario: u.nombreUsuario,
    rol: u.rol,
    activo: u.activo !== false,
    telefono: e.telefono,
    lada: e.lada,
    creadoEn: e.creadoEn,
    ultimoAcceso: e.ultimoAcceso,
    eliminadoEn: usuariosEliminados.get(u.idUsuario) ?? null,
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

// ---------- Clientes (Gerente → Clientes) ----------
function aClienteAdminMock(c: Cliente): ClienteAdmin {
  const delCliente = baseDatos.reservaciones.filter((r) => r.idCliente === c.idCliente)
  return {
    idCliente: c.idCliente,
    nombre: c.nombre,
    telefono: c.telefono,
    lada: c.lada ?? '52',
    correo: c.correo,
    tieneCuenta: false,
    reservacionesVigentes: delCliente.filter((r) => r.estado === 'pendiente' || r.estado === 'confirmada').length,
    totalReservaciones: delCliente.length,
    eliminadoEn: baseDatos.clientesEliminados.get(c.idCliente) ?? null,
  }
}

export function crearClientesMock(): ClientesService {
  const buscar = (id: number): Cliente => {
    const c = baseDatos.clientes.find((x) => x.idCliente === id)
    if (!c) throw noExiste('El cliente')
    return c
  }
  return {
    listar(opciones) {
      return conRetraso(() =>
        baseDatos.clientes
          .filter((c) => baseDatos.clientesEliminados.has(c.idCliente) === Boolean(opciones?.eliminados))
          .map(aClienteAdminMock)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      )
    },

    actualizar(id, cambio) {
      return conRetraso(() => {
        const c = buscar(id)
        if (baseDatos.clientesEliminados.has(id)) throw new ErrorServicio('estado_invalido', 'El cliente está eliminado. Restáuralo para poder editarlo.', 409)
        const lada = cambio.lada ?? c.lada ?? '52'
        const telefono = cambio.telefono ?? c.telefono ?? ''
        if (cambio.telefono !== undefined || cambio.lada !== undefined) {
          const { min, max } = rangoTelefono(lada)
          if (telefono !== '' && (!/^\d+$/.test(telefono) || telefono.length < min || telefono.length > max)) {
            throw new ErrorServicio('estado_invalido', `El teléfono debe tener ${textoDigitos(lada)}.`, 422)
          }
        }
        const otro = baseDatos.clientes.find((x) => x.idCliente !== id && ((cambio.telefono !== undefined && x.telefono === cambio.telefono) || (cambio.correo !== undefined && x.correo?.toLowerCase() === cambio.correo.toLowerCase())))
        if (otro) {
          throw new ErrorServicio(
            'estado_invalido',
            baseDatos.clientesEliminados.has(otro.idCliente) ? 'Hay un cliente eliminado con ese teléfono o correo. Restáuralo desde «Eliminados» en lugar de repetirlo.' : 'Ya existe un cliente con ese teléfono o correo.',
            409,
          )
        }
        if (cambio.nombre !== undefined) c.nombre = cambio.nombre.trim()
        if (cambio.telefono !== undefined) c.telefono = cambio.telefono
        if (cambio.lada !== undefined) c.lada = cambio.lada
        if (cambio.correo !== undefined) c.correo = cambio.correo.trim().toLowerCase()
        return aClienteAdminMock(c)
      })
    },

    eliminar(id) {
      return conRetraso(() => {
        const c = buscar(id)
        if (baseDatos.clientesEliminados.has(id)) throw new ErrorServicio('estado_invalido', 'El cliente ya está eliminado.', 409)
        const vigentes = baseDatos.reservaciones.filter((r) => r.idCliente === id && (r.estado === 'pendiente' || r.estado === 'confirmada')).length
        if (vigentes > 0) {
          throw new ErrorServicio('estado_invalido', `${c.nombre} tiene ${vigentes} reservación(es) pendientes o confirmadas. Cancélalas o espera a que pasen antes de eliminarlo.`, 409)
        }
        if (baseDatos.listaEspera.some((e) => e.idCliente === id && e.estado === 'esperando')) {
          throw new ErrorServicio('estado_invalido', `${c.nombre} está en la lista de espera. Quítalo de la lista antes de eliminarlo.`, 409)
        }
        baseDatos.clientesEliminados.set(id, new Date())
        return aClienteAdminMock(c)
      })
    },

    restaurar(id) {
      return conRetraso(() => {
        const c = buscar(id)
        if (!baseDatos.clientesEliminados.has(id)) throw new ErrorServicio('estado_invalido', 'El cliente no está eliminado.', 409)
        baseDatos.clientesEliminados.delete(id)
        return aClienteAdminMock(c)
      })
    },
  }
}

export function crearUsuariosMock(): UsuariosService {
  return {
    listar(opciones) {
      return conRetraso(() => baseDatos.usuarios.filter((u) => usuariosEliminados.has(u.idUsuario) === Boolean(opciones?.eliminados)).map((u) => aAdmin(u.idUsuario)).sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre)))
    },

    crear(n) {
      return conRetraso(() => {
        const igualEliminado = baseDatos.usuarios.some(
          (u) => usuariosEliminados.has(u.idUsuario) && (u.nombreUsuario.toLowerCase() === n.nombreUsuario.trim().toLowerCase() || datosExtra(u.idUsuario, u.nombreUsuario).correo.toLowerCase() === n.correo.trim().toLowerCase()),
        )
        if (igualEliminado) throw new ErrorServicio('estado_invalido', 'Hay un usuario eliminado con ese correo, usuario o teléfono. Restáuralo desde «Eliminados» en lugar de crear otro.', 409)
        if (baseDatos.usuarios.some((u) => u.nombreUsuario.toLowerCase() === n.nombreUsuario.trim().toLowerCase())) throw duplicado('nombre de usuario')
        if (baseDatos.usuarios.some((u) => datosExtra(u.idUsuario, u.nombreUsuario).correo.toLowerCase() === n.correo.trim().toLowerCase())) throw duplicado('correo')
        const id = Math.max(0, ...baseDatos.usuarios.map((u) => u.idUsuario)) + 1
        const telefono = telefonoValido(n.telefono, undefined, n.lada || '52')
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
        extra.set(id, { correo: n.correo.trim(), telefono, lada: n.lada || '52', creadoEn: new Date(), ultimoAcceso: null })
        return aAdmin(id)
      })
    },

    actualizar(id, c) {
      return conRetraso(() => {
        const u = baseDatos.usuarios.find((x) => x.idUsuario === id)
        if (!u) throw noExiste('El usuario')
        if (usuariosEliminados.has(id)) throw new ErrorServicio('estado_invalido', 'El usuario está eliminado. Restáuralo para poder editarlo.', 409)
        const primerGerente = baseDatos.usuarios
          .filter((candidato) => candidato.rol === 'gerente')
          .sort((a, b) => a.idUsuario - b.idUsuario)[0]
        if (
          primerGerente?.idUsuario === id &&
          ((c.activo === false) || (c.rol !== undefined && c.rol !== 'gerente'))
        ) {
          throw new ErrorServicio('estado_invalido', 'El primer gerente no se puede desactivar ni cambiar de rol.', 409)
        }
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
        if (c.telefono !== undefined) e.telefono = telefonoValido(c.telefono, id, c.lada ?? e.lada)
        if (c.lada !== undefined) e.lada = c.lada
        return aAdmin(id)
      })
    },

    eliminar(id) {
      return conRetraso(() => {
        const u = baseDatos.usuarios.find((x) => x.idUsuario === id)
        if (!u) throw noExiste('El usuario')
        if (usuariosEliminados.has(id)) throw new ErrorServicio('estado_invalido', 'El usuario ya está eliminado.', 409)
        if (id === idSesion()) throw new ErrorServicio('estado_invalido', 'No puedes eliminar tu propio usuario.', 409)
        const primerGerente = baseDatos.usuarios.filter((x) => x.rol === 'gerente').sort((a, b) => a.idUsuario - b.idUsuario)[0]
        if (primerGerente?.idUsuario === id) throw new ErrorServicio('estado_invalido', 'El primer gerente no se puede eliminar.', 409)
        if (u.rol === 'gerente' && u.activo !== false) {
          const otros = baseDatos.usuarios.filter((x) => x.idUsuario !== id && x.rol === 'gerente' && x.activo !== false && !usuariosEliminados.has(x.idUsuario))
          if (otros.length === 0) throw new ErrorServicio('estado_invalido', 'Debe quedar al menos un gerente activo.', 409)
        }
        u.activo = false
        usuariosEliminados.set(id, new Date())
        return aAdmin(id)
      })
    },

    restaurar(id) {
      return conRetraso(() => {
        if (!baseDatos.usuarios.some((x) => x.idUsuario === id)) throw noExiste('El usuario')
        if (!usuariosEliminados.has(id)) throw new ErrorServicio('estado_invalido', 'El usuario no está eliminado.', 409)
        usuariosEliminados.delete(id)
        return aAdmin(id)
      })
    },

    cambiarContrasena(id, contrasena, contrasenaActual) {
      return conRetraso(() => {
        const u = baseDatos.usuarios.find((x) => x.idUsuario === id)
        if (!u) throw noExiste('El usuario')
        if (contrasenaActual !== u.contrasena) {
          throw new ErrorServicio('credenciales_invalidas', 'La contraseña anterior del usuario es incorrecta.', 401)
        }
        u.contrasena = contrasena
      })
    },

    enviarRestablecimiento(id) {
      return conRetraso(() => {
        const u = baseDatos.usuarios.find((x) => x.idUsuario === id)
        if (!u) throw noExiste('El usuario')
        if (u.activo === false) {
          throw new ErrorServicio('estado_invalido', 'El usuario está inactivo. Actívalo antes de restablecer su contraseña.', 409)
        }
        const enlace = crearEnlaceMock(id)
        if (!enlace) {
          throw new ErrorServicio(
            'estado_invalido',
            'Ya se enviaron 3 enlaces a este usuario en la última hora. Pídele que revise su correo (también spam).',
            429,
          )
        }
        console.info(`[demo] Enlace para crear contraseña de ${u.nombreUsuario}: ${enlace}`)
        return enmascararCorreo(datosExtra(u.idUsuario, u.nombreUsuario).correo)
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
        eliminadoEn: null,
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

/**
 * Merma de un producto: si controla existencia, la descuenta (sin pasar de lo que hay) y devuelve `true`; si se prepara al
 * momento, devuelve `false` (solo queda el registro). Falla si no existe, está eliminado o no alcanza.
 */
export function descontarExistenciaMock(idProducto: number, cantidad: number): boolean {
  const p = baseDatos.categorias.flatMap((c) => c.productos).find((x) => x.idProducto === idProducto)
  if (!p) {
    if (productosEliminados.some((e) => e.producto.idProducto === idProducto)) {
      throw new ErrorServicio('estado_invalido', 'El producto está eliminado: restáuralo para registrar su merma.', 409)
    }
    throw noExiste('El producto')
  }
  const i = inv(idProducto, p.disponible)
  if (!i.controla) return false
  if (cantidad > i.existencia) {
    throw new ErrorServicio(
      'estado_invalido',
      i.existencia === 0 ? `«${p.nombre}» no tiene existencias en el inventario.` : `Solo quedan ${i.existencia} de «${p.nombre}» en el inventario: no se pueden registrar ${cantidad} como merma.`,
      422,
    )
  }
  i.existencia -= cantidad
  sincronizarDisponible(idProducto)
  return true
}

/** Devolución aprobada con «reponer al inventario»: suma las unidades al producto, si controla existencia. */
export function reponerExistenciaMock(idProducto: number, cantidad: number): void {
  const p = baseDatos.categorias.flatMap((c) => c.productos).find((x) => x.idProducto === idProducto)
  if (!p) return
  const i = inv(idProducto, p.disponible)
  if (!i.controla) return
  i.existencia += cantidad
  sincronizarDisponible(idProducto)
}

// «Papelera» de la demo: lo eliminado sale de `baseDatos` (así desaparece del menú del mesero y de las listas) y se
// guarda aquí para poder verlo y restaurarlo, como hace la API con `eliminado_en`.
interface ProductoEliminado {
  producto: Producto
  eliminadoEn: Date
}
interface CategoriaEliminada {
  idCategoria: number
  nombre: string
  eliminadoEn: Date
}
const productosEliminados: ProductoEliminado[] = []
const categoriasEliminadas: CategoriaEliminada[] = []

function nombreDeCategoria(id: number): string {
  return baseDatos.categorias.find((c) => c.idCategoria === id)?.nombre ?? categoriasEliminadas.find((c) => c.idCategoria === id)?.nombre ?? ''
}

function aProductoEliminado(e: ProductoEliminado): ProductoAdmin {
  const p = e.producto
  const i = inv(p.idProducto, false)
  return {
    idProducto: p.idProducto,
    idCategoria: p.idCategoria,
    categoria: nombreDeCategoria(p.idCategoria),
    nombre: p.nombre,
    presentacion: p.presentacion ?? '',
    descripcion: p.descripcion,
    precio: p.precio,
    activo: activos.get(p.idProducto) ?? false,
    existencia: i.existencia,
    stockMinimo: i.stockMinimo,
    controlaExistencia: i.controla,
    disponible: false,
    eliminadoEn: e.eliminadoEn,
  }
}

function aCategoria(id: number): CategoriaAdmin {
  const c = baseDatos.categorias.find((x) => x.idCategoria === id)
  if (!c) throw noExiste('La categoría')
  return { idCategoria: c.idCategoria, nombre: c.nombre, totalProductos: c.productos.length, eliminadoEn: null }
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
    caracteristicas: [...m.caracteristicas],
    activa: m.activa,
    estado: m.estado,
    eliminadoEn: elimMesas.get(m.idMesa) ?? null,
  }
}

function aCaracteristicaAdmin(id: number): CaracteristicaAdmin {
  const c = baseDatos.caracteristicas.find((x) => x.idCaracteristica === id)
  if (!c) throw noExiste('La característica')
  return {
    ...c,
    totalMesas: baseDatos.mesas.filter((m) => m.caracteristicas.includes(id) && !elimMesas.has(m.idMesa)).length,
    eliminadoEn: elimCaracteristicas.get(id) ?? null,
    totalReservaciones: baseDatos.reservaciones.filter((r) => r.preferencias?.caracteristicas.some((x) => x.idCaracteristica === id)).length,
  }
}

function validarNombreCaracteristica(nombre: string, actual?: number): void {
  const texto = nombre.trim()
  if (!texto || texto.length > 40) throw new ErrorServicio('estado_invalido', 'El nombre debe tener entre 1 y 40 caracteres.', 422)
  const igual = baseDatos.caracteristicas.find((c) => c.idCaracteristica !== actual && c.nombre.toLocaleLowerCase('es') === texto.toLocaleLowerCase('es'))
  if (igual) {
    throw new ErrorServicio(
      'estado_invalido',
      elimCaracteristicas.has(igual.idCaracteristica) ? 'Hay una característica eliminada con ese nombre. Restáurala desde «Eliminadas» en lugar de crear otra.' : 'Ya existe una característica con ese nombre.',
      409,
    )
  }
}

const claveSeccion = (nombre: string) => nombre.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()

function aSeccionAdmin(nombre: string): SeccionAdmin {
  const seccion = baseDatos.secciones.find((s) => s.nombre === nombre)
  if (!seccion) throw noExiste('La sección')
  return {
    nombre: seccion.nombre,
    activa: seccion.activa,
    totalMesas: baseDatos.mesas.filter((m) => m.zona === nombre && !elimMesas.has(m.idMesa)).length,
    eliminadoEn: elimSecciones.get(nombre) ?? null,
  }
}

function validarNombreSeccion(nombre: string, actual?: string): void {
  const texto = nombre.trim()
  if (!texto || texto.length > MESA_ZONA_MAX) {
    throw new ErrorServicio('estado_invalido', `El nombre de la sección debe tener entre 1 y ${MESA_ZONA_MAX} caracteres.`, 422)
  }
  const igual = baseDatos.secciones.find((s) => s.nombre !== actual && claveSeccion(s.nombre) === claveSeccion(texto))
  if (igual) {
    throw new ErrorServicio(
      'estado_invalido',
      elimSecciones.has(igual.nombre) ? 'Hay una sección eliminada con ese nombre. Restáurala desde «Eliminadas» en lugar de crear otra.' : 'Ya existe una sección con ese nombre.',
      409,
    )
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
  caracteristicas?: number[]
}): void {
  for (const id of c.caracteristicas ?? []) {
    if (!baseDatos.caracteristicas.some((x) => x.idCaracteristica === id && x.activa)) {
      throw new ErrorServicio('estado_invalido', 'Alguna característica no existe o está desactivada. Actualiza la pantalla.', 422)
    }
  }
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
  const igual = baseDatos.mesas.find((m) => m.numero === numero && m.idMesa !== exceptoId)
  if (igual) {
    throw new ErrorServicio(
      'estado_invalido',
      elimMesas.has(igual.idMesa) ? `Hay una mesa ${numero} eliminada. Restáurala desde «Eliminadas» en lugar de crear otra.` : `Ya existe la mesa ${numero}.`,
      409,
    )
  }
}

/** Una mesa solo se puede dejar de usar (no disponible o eliminada) si está libre, sin cuenta abierta y sin reservaciones vigentes. */
/** Un método de pago no se elimina si es el de efectivo (el cuadre de caja lo necesita) ni si una cuenta abierta lo tiene solicitado. */
function exigirMetodoEliminable(metodo: { idMetodo: number; nombre: string; esEfectivo: boolean }): void {
  if (metodo.esEfectivo) {
    throw new ErrorServicio('estado_invalido', `El método «${metodo.nombre}» está marcado como efectivo y no se puede eliminar: el cuadre de caja lo necesita.`, 409)
  }
  const solicitado = baseDatos.cuentas.filter((c) => c.idMetodoPagoSolicitado === metodo.idMetodo && c.estado !== 'cerrada').length
  if (solicitado > 0) throw new ErrorServicio('estado_invalido', `«${metodo.nombre}» lo tienen solicitado ${solicitado} cuenta(s) abiertas. Espera a que se cobren.`, 409)
}

function exigirMesaSinUsoMock(mesa: MesaGuardada, destino: string): void {
  if (mesa.estado !== 'libre') throw new ErrorServicio('estado_invalido', `La mesa ${mesa.numero} está ${mesa.estado}: libérala antes de ${destino}.`, 409)
  if (baseDatos.cuentas.some((c) => c.idMesa === mesa.idMesa && c.estado !== 'cerrada')) {
    throw new ErrorServicio('estado_invalido', `La mesa ${mesa.numero} tiene una cuenta abierta: hay que cerrarla antes.`, 409)
  }
  if (baseDatos.reservaciones.some((r) => r.idMesa === mesa.idMesa && (r.estado === 'pendiente' || r.estado === 'confirmada'))) {
    throw new ErrorServicio('estado_invalido', `La mesa ${mesa.numero} tiene reservaciones vigentes: cancélalas o cámbialas de mesa antes.`, 409)
  }
}

// ---------- Eliminar en cascada (igual que la API) ----------
// Eliminar una categoría de pago, una sección o una categoría del menú elimina TAMBIÉN lo que tiene dentro, todo o nada y con
// la misma hora. Al restaurarla vuelven los que se eliminaron CON ella (los eliminados antes por separado no).

/** Hora de una cascada: ahora, pero nunca igual ni anterior a la de un hijo eliminado antes por separado. */
function ahoraDeCascada(horasDeHijos: Array<Date | undefined>): Date {
  const maxima = Math.max(0, ...horasDeHijos.map((h) => h?.getTime() ?? 0))
  return new Date(Math.max(Date.now(), maxima + 1000))
}

/** Si un hijo no se puede eliminar, el error dice de qué contenedor se trataba. */
function enCascadaMock<T>(padre: string, accion: () => T): T {
  try {
    return accion()
  } catch (e) {
    if (e instanceof ErrorServicio && e.estadoHttp === 409) {
      const m = e.message
      const texto = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(m) ? m.charAt(0).toLowerCase() + m.slice(1) : m
      throw new ErrorServicio('estado_invalido', `No se puede eliminar «${padre}»: ${texto}`, 409)
    }
    throw e
  }
}

// Lo eliminado (lógico) y cuándo. Como en la API, algo eliminado queda también inactivo (activa/activo = false), así que
// las pantallas que ya filtran por «activo» lo ocultan sin cambios.
const elimCanales = new Map<number, Date>()
const elimCategoriasPago = new Map<number, Date>()
const elimMetodos = new Map<number, Date>()
const elimCaracteristicas = new Map<number, Date>()
const elimSecciones = new Map<string, Date>()
const elimMesas = new Map<number, Date>()
const pideElim = (o?: { eliminados?: boolean }) => Boolean(o?.eliminados)

export function crearCatalogoMock(): CatalogoService {
  // Los productos agotados de la demo cuentan como "activos sin existencia" salvo que se indique otra cosa.
  return {
    listarCanalesDisponibles() {
      return conRetraso(() => structuredClone(baseDatos.canales.filter((c) => c.activo)))
    },

    listarCanales(opciones) {
      return conRetraso(() =>
        baseDatos.canales
          .filter((c) => elimCanales.has(c.idCanal) === pideElim(opciones))
          .map((c) => ({ ...c, eliminadoEn: elimCanales.get(c.idCanal) ?? null })),
      )
    },

    crearCanal(nombre) {
      return conRetraso(() => {
        const limpio = nombre.trim()
        if (!limpio) throw new ErrorServicio('estado_invalido', 'El nombre del canal es obligatorio.', 422)
        if (limpio.length > 40) throw new ErrorServicio('estado_invalido', 'El nombre del canal admite hasta 40 caracteres.', 422)
        const igual = baseDatos.canales.find((c) => c.nombre.toLocaleLowerCase() === limpio.toLocaleLowerCase())
        if (igual) {
          throw new ErrorServicio(
            'estado_invalido',
            elimCanales.has(igual.idCanal) ? 'Hay un canal eliminado con ese nombre. Restáuralo desde «Eliminados» en lugar de crear otro.' : 'Ya existe un canal con ese nombre.',
            409,
          )
        }
        const canal = { idCanal: Math.max(0, ...baseDatos.canales.map((c) => c.idCanal)) + 1, nombre: limpio, activo: true }
        baseDatos.canales.push(canal)
        return { ...canal }
      })
    },

    actualizarCanal(idCanal, cambio) {
      return conRetraso(() => {
        const canal = baseDatos.canales.find((c) => c.idCanal === idCanal)
        if (!canal) throw noExiste('El canal')
        if (elimCanales.has(idCanal)) throw new ErrorServicio('estado_invalido', 'El canal está eliminado. Restáuralo para poder cambiarlo.', 409)
        canal.activo = cambio.activo
        return { ...canal }
      })
    },

    eliminarCanal(idCanal) {
      return conRetraso(() => {
        const canal = baseDatos.canales.find((c) => c.idCanal === idCanal)
        if (!canal) throw noExiste('El canal')
        if (elimCanales.has(idCanal)) throw new ErrorServicio('estado_invalido', 'El canal ya está eliminado.', 409)
        const enUso = baseDatos.cuentas.filter((c) => (c as { idCanal?: number | null }).idCanal === idCanal && c.estado !== 'cerrada').length
        if (enUso > 0) throw new ErrorServicio('estado_invalido', `«${canal.nombre}» lo usan ${enUso} pedido(s) para llevar que aún no se cobran. Espera a que se cobren.`, 409)
        canal.activo = false
        elimCanales.set(idCanal, new Date())
        return { ...canal, eliminadoEn: elimCanales.get(idCanal) ?? null }
      })
    },

    restaurarCanal(idCanal) {
      return conRetraso(() => {
        const canal = baseDatos.canales.find((c) => c.idCanal === idCanal)
        if (!canal) throw noExiste('El canal')
        if (!elimCanales.has(idCanal)) throw new ErrorServicio('estado_invalido', 'El canal no está eliminado.', 409)
        elimCanales.delete(idCanal)
        return { ...canal, eliminadoEn: null }
      })
    },

    listarMetodosPagoDisponibles() {
      return conRetraso(() => structuredClone(metodosPagoMock.filter((metodo) =>
        metodo.activo && categoriasMetodoPagoMock.some((categoria) =>
          categoria.idCategoriaMetodoPago === metodo.idCategoriaMetodoPago && categoria.activo,
        ),
      )))
    },

    listarMetodosPago(opciones) {
      return conRetraso(() => {
        const eliminados = pideElim(opciones)
        const conFecha = (m: MetodoPagoAdmin): MetodoPagoAdmin => ({ ...m, eliminadoEn: elimMetodos.get(m.idMetodo) ?? null })
        const resultado: CategoriaMetodoPagoAdmin[] = []
        for (const categoria of categoriasMetodoPagoMock) {
          const catEliminada = elimCategoriasPago.has(categoria.idCategoriaMetodoPago)
          const metodos = metodosPagoMock.filter((m) => m.idCategoriaMetodoPago === categoria.idCategoriaMetodoPago).filter((m) => elimMetodos.has(m.idMetodo) === eliminados).map(conFecha)
          if (eliminados ? !(catEliminada || metodos.length > 0) : catEliminada) continue
          resultado.push({ ...categoria, eliminadoEn: elimCategoriasPago.get(categoria.idCategoriaMetodoPago) ?? null, metodos })
        }
        return structuredClone(resultado)
      })
    },

    eliminarCategoriaMetodoPago(id) {
      return conRetraso(() => {
        const categoria = categoriasMetodoPagoMock.find((c) => c.idCategoriaMetodoPago === id)
        if (!categoria) throw noExiste('La categoría de pago')
        if (elimCategoriasPago.has(id)) throw new ErrorServicio('estado_invalido', 'La categoría ya está eliminada.', 409)
        const hijos = metodosPagoMock.filter((m) => m.idCategoriaMetodoPago === id)
        const vigentes = hijos.filter((m) => !elimMetodos.has(m.idMetodo))
        // Todo o nada: primero se comprueba cada método; si alguno no se puede eliminar, no se toca nada.
        for (const m of vigentes) {
          enCascadaMock(categoria.nombre, () => exigirMetodoEliminable(m))
        }
        const ahora = ahoraDeCascada(hijos.map((m) => elimMetodos.get(m.idMetodo)))
        for (const m of vigentes) {
          m.activo = false
          elimMetodos.set(m.idMetodo, ahora)
        }
        categoria.activo = false
        elimCategoriasPago.set(id, ahora)
        return { ...structuredClone(categoria), eliminadoEn: ahora, metodos: [] }
      })
    },

    restaurarCategoriaMetodoPago(id) {
      return conRetraso(() => {
        const categoria = categoriasMetodoPagoMock.find((c) => c.idCategoriaMetodoPago === id)
        if (!categoria) throw noExiste('La categoría de pago')
        const cuando = elimCategoriasPago.get(id)
        if (!cuando) throw new ErrorServicio('estado_invalido', 'La categoría no está eliminada.', 409)
        // Vuelven (inactivos) los métodos que se eliminaron CON la categoría.
        for (const m of metodosPagoMock) {
          if (m.idCategoriaMetodoPago === id && elimMetodos.get(m.idMetodo)?.getTime() === cuando.getTime()) elimMetodos.delete(m.idMetodo)
        }
        elimCategoriasPago.delete(id)
        return { ...structuredClone(categoria), eliminadoEn: null, metodos: structuredClone(metodosPagoMock.filter((m) => m.idCategoriaMetodoPago === id && !elimMetodos.has(m.idMetodo))) }
      })
    },

    eliminarMetodoPago(id) {
      return conRetraso(() => {
        const metodo = metodosPagoMock.find((m) => m.idMetodo === id)
        if (!metodo) throw noExiste('El método de pago')
        if (elimMetodos.has(id)) throw new ErrorServicio('estado_invalido', 'El método de pago ya está eliminado.', 409)
        exigirMetodoEliminable(metodo)
        metodo.activo = false
        elimMetodos.set(id, new Date())
        return { ...metodo, eliminadoEn: elimMetodos.get(id) ?? null }
      })
    },

    restaurarMetodoPago(id) {
      return conRetraso(() => {
        const metodo = metodosPagoMock.find((m) => m.idMetodo === id)
        if (!metodo) throw noExiste('El método de pago')
        if (!elimMetodos.has(id)) throw new ErrorServicio('estado_invalido', 'El método de pago no está eliminado.', 409)
        if (elimCategoriasPago.has(metodo.idCategoriaMetodoPago)) throw new ErrorServicio('estado_invalido', 'Su categoría está eliminada. Restaura primero la categoría.', 409)
        elimMetodos.delete(id)
        return { ...metodo, eliminadoEn: null }
      })
    },

    crearCategoriaMetodoPago(nombre, tipo) {
      return conRetraso(() => {
        const limpio = nombre.trim()
        if (!limpio || limpio.length > 40) throw new ErrorServicio('estado_invalido', 'El nombre debe tener entre 1 y 40 caracteres.', 422)
        if (categoriasMetodoPagoMock.some((categoria) => categoria.nombre.toLocaleLowerCase() === limpio.toLocaleLowerCase())) {
          throw new ErrorServicio('estado_invalido', 'Ya existe una categoría de pago con ese nombre.', 409)
        }
        const idCategoriaMetodoPago = Math.max(0, ...categoriasMetodoPagoMock.map((categoria) => categoria.idCategoriaMetodoPago)) + 1
        const categoria = { idCategoriaMetodoPago, nombre: limpio, tipo, activo: true, metodos: [] }
        categoriasMetodoPagoMock.push(categoria)
        return structuredClone(categoria)
      })
    },

    actualizarCategoriaMetodoPago(id, cambio) {
      return conRetraso(() => {
        const categoria = categoriasMetodoPagoMock.find((item) => item.idCategoriaMetodoPago === id)
        if (!categoria) throw noExiste('La categoría de pago')
        if (elimCategoriasPago.has(id)) throw new ErrorServicio('estado_invalido', 'La categoría está eliminada. Restáurala para poder cambiarla.', 409)
        categoria.activo = cambio.activo
        return {
          ...structuredClone(categoria),
          metodos: structuredClone(metodosPagoMock.filter((metodo) => metodo.idCategoriaMetodoPago === id)),
        }
      })
    },

    crearMetodoPago(nombre, idCategoriaMetodoPago, esEfectivo) {
      return conRetraso(() => {
        const limpio = nombre.trim()
        const categoria = categoriasMetodoPagoMock.find((item) => item.idCategoriaMetodoPago === idCategoriaMetodoPago)
        if (!categoria) throw noExiste('La categoría de pago')
        if (elimCategoriasPago.has(idCategoriaMetodoPago)) throw new ErrorServicio('estado_invalido', 'La categoría de pago está eliminada. Restáurala o elige otra.', 422)
        if (!limpio || limpio.length > 40) throw new ErrorServicio('estado_invalido', 'El nombre debe tener entre 1 y 40 caracteres.', 422)
        const igualMetodo = metodosPagoMock.find((metodo) => metodo.nombre.toLocaleLowerCase() === limpio.toLocaleLowerCase())
        if (igualMetodo) {
          throw new ErrorServicio(
            'estado_invalido',
            elimMetodos.has(igualMetodo.idMetodo) ? 'Hay un método de pago eliminado con ese nombre. Restáuralo desde «Eliminados» en lugar de crear otro.' : 'Ya existe un método de pago con ese nombre.',
            409,
          )
        }
        if (esEfectivo && categoria.tipo !== 'fisico') {
          throw new ErrorServicio('estado_invalido', 'El método de efectivo debe pertenecer a una categoría física.', 422)
        }
        if (esEfectivo && metodosPagoMock.some((metodo) => metodo.esEfectivo)) {
          throw new ErrorServicio('estado_invalido', 'Ya existe un método marcado como efectivo.', 409)
        }
        const idMetodo = Math.max(0, ...metodosPagoMock.map((metodo) => metodo.idMetodo)) + 1
        const metodo = {
          idMetodo,
          nombre: limpio,
          idCategoriaMetodoPago,
          categoria: categoria.nombre,
          tipo: categoria.tipo,
          esEfectivo,
          activo: true,
        }
        metodosPagoMock.push(metodo)
        return { ...metodo }
      })
    },

    actualizarMetodoPago(id, cambio) {
      return conRetraso(() => {
        const metodo = metodosPagoMock.find((item) => item.idMetodo === id)
        if (!metodo) throw noExiste('El método de pago')
        if (elimMetodos.has(id)) throw new ErrorServicio('estado_invalido', 'El método de pago está eliminado. Restáuralo para poder cambiarlo.', 409)
        if (cambio.esEfectivo && metodo.tipo !== 'fisico') {
          throw new ErrorServicio('estado_invalido', 'El método de efectivo debe pertenecer a una categoría física.', 422)
        }
        if (cambio.esEfectivo && !metodo.esEfectivo && metodosPagoMock.some((item) => item.esEfectivo)) {
          throw new ErrorServicio('estado_invalido', 'Ya existe un método marcado como efectivo.', 409)
        }
        if (cambio.activo !== undefined) metodo.activo = cambio.activo
        if (cambio.esEfectivo !== undefined) metodo.esEfectivo = cambio.esEfectivo
        return { ...metodo }
      })
    },

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
        if (!Number.isInteger(cambio.anticipacionMinutos) || cambio.anticipacionMinutos < 0 || cambio.anticipacionMinutos > 1440) {
          throw new ErrorServicio('estado_invalido', 'La anticipación debe estar entre 0 y 1440 minutos.', 422)
        }
        if (!Number.isInteger(cambio.duracionReservacionMinutos) || cambio.duracionReservacionMinutos < 30 || cambio.duracionReservacionMinutos > 360) {
          throw new ErrorServicio('estado_invalido', 'La duración de la reservación debe estar entre 30 y 360 minutos.', 422)
        }
        const errorHorario = validarHorario(cambio)
        if (errorHorario) throw new ErrorServicio('estado_invalido', errorHorario, 422)
        baseDatos.configuracionReservacion = { ...cambio, dias: cambio.dias.map((d) => ({ ...d })) }
        return { ...baseDatos.configuracionReservacion, dias: baseDatos.configuracionReservacion.dias.map((d) => ({ ...d })) }
      })
    },

    listarCaracteristicas(opciones) {
      return conRetraso(() => baseDatos.caracteristicas
        .filter((c) => elimCaracteristicas.has(c.idCaracteristica) === pideElim(opciones))
        .map((c) => aCaracteristicaAdmin(c.idCaracteristica))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    },

    crearCaracteristica(nombre) {
      return conRetraso(() => {
        validarNombreCaracteristica(nombre)
        const nueva = { idCaracteristica: Math.max(0, ...baseDatos.caracteristicas.map((c) => c.idCaracteristica)) + 1, nombre: nombre.trim(), activa: true }
        baseDatos.caracteristicas.push(nueva)
        return aCaracteristicaAdmin(nueva.idCaracteristica)
      })
    },

    actualizarCaracteristica(id, cambio) {
      return conRetraso(() => {
        const c = baseDatos.caracteristicas.find((x) => x.idCaracteristica === id)
        if (!c) throw noExiste('La característica')
        if (elimCaracteristicas.has(id)) throw new ErrorServicio('estado_invalido', 'La característica está eliminada. Restáurala para poder cambiarla.', 409)
        if ('nombre' in cambio) {
          validarNombreCaracteristica(cambio.nombre, id)
          c.nombre = cambio.nombre.trim()
        } else {
          c.activa = cambio.activa
        }
        return aCaracteristicaAdmin(id)
      })
    },

    eliminarCaracteristica(id) {
      return conRetraso(() => {
        const c = baseDatos.caracteristicas.find((x) => x.idCaracteristica === id)
        if (!c) throw noExiste('La característica')
        if (elimCaracteristicas.has(id)) throw new ErrorServicio('estado_invalido', 'La característica ya está eliminada.', 409)
        c.activa = false
        elimCaracteristicas.set(id, new Date())
      })
    },

    restaurarCaracteristica(id) {
      return conRetraso(() => {
        if (!baseDatos.caracteristicas.some((x) => x.idCaracteristica === id)) throw noExiste('La característica')
        if (!elimCaracteristicas.has(id)) throw new ErrorServicio('estado_invalido', 'La característica no está eliminada.', 409)
        elimCaracteristicas.delete(id)
        return aCaracteristicaAdmin(id)
      })
    },

    listarSecciones(opciones) {
      return conRetraso(() => baseDatos.secciones
        .filter((s) => elimSecciones.has(s.nombre) === pideElim(opciones))
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
        if (elimSecciones.has(nombre)) throw new ErrorServicio('estado_invalido', 'La sección está eliminada. Restáurala para poder cambiarla.', 409)
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
        if (elimSecciones.has(nombre)) throw new ErrorServicio('estado_invalido', 'La sección está eliminada. Restáurala para poder cambiarla.', 409)
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
        if (elimSecciones.has(nombre)) throw new ErrorServicio('estado_invalido', 'La sección ya está eliminada.', 409)
        if (nombre === 'Para llevar') throw new ErrorServicio('estado_invalido', `«${nombre}» la usa el sistema para los pedidos para llevar y no se puede eliminar.`, 409)
        const hijas = baseDatos.mesas.filter((m) => m.zona === nombre)
        const vigentes = hijas.filter((m) => !elimMesas.has(m.idMesa))
        // Todo o nada: si una mesa está ocupada, con cuenta abierta o con reservaciones vigentes, no se elimina nada.
        for (const m of vigentes) enCascadaMock(nombre, () => exigirMesaSinUsoMock(m, 'eliminarla'))
        const ahora = ahoraDeCascada(hijas.map((m) => elimMesas.get(m.idMesa)))
        for (const m of vigentes) {
          m.activa = false
          elimMesas.set(m.idMesa, ahora)
        }
        seccion.activa = false
        elimSecciones.set(nombre, ahora)
      })
    },

    restaurarSeccion(nombre) {
      return conRetraso(() => {
        if (!baseDatos.secciones.some((s) => s.nombre === nombre)) throw noExiste('La sección')
        const cuando = elimSecciones.get(nombre)
        if (!cuando) throw new ErrorServicio('estado_invalido', 'La sección no está eliminada.', 409)
        // Vuelven (no disponibles) las mesas que se eliminaron CON la sección.
        for (const m of baseDatos.mesas) {
          if (m.zona === nombre && elimMesas.get(m.idMesa)?.getTime() === cuando.getTime()) elimMesas.delete(m.idMesa)
        }
        elimSecciones.delete(nombre)
        return aSeccionAdmin(nombre)
      })
    },

    listarMesas(opciones) {
      return conRetraso(() =>
        baseDatos.mesas
          .filter((m) => elimMesas.has(m.idMesa) === pideElim(opciones))
          .sort((a, b) => a.numero - b.numero)
          .map(aMesaAdmin),
      )
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
          caracteristicas: [...new Set(mesa.caracteristicas ?? [])],
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
        if (elimMesas.has(id)) throw new ErrorServicio('estado_invalido', `La mesa ${mesa.numero} está eliminada. Restáurala para poder cambiarla.`, 409)
        if (Object.keys(cambio).length === 0) throw new ErrorServicio('estado_invalido', 'No hay nada que cambiar.', 422)
        validarDatosMesa(cambio)
        if (cambio.zona !== undefined) exigirSeccionActiva(cambio.zona)

        if (cambio.activa === false && mesa.activa) exigirMesaSinUsoMock(mesa, 'marcarla como no disponible')
        if (cambio.numero !== undefined) exigirNumeroLibre(cambio.numero, id)

        if (cambio.numero !== undefined) mesa.numero = cambio.numero
        if (cambio.capacidad !== undefined) mesa.capacidad = cambio.capacidad
        if (cambio.zona !== undefined) mesa.zona = cambio.zona.trim()
        if (cambio.caracteristicas !== undefined) {
          // Como la API: las desactivadas que ya tenía la mesa se conservan.
          const inactivas = mesa.caracteristicas.filter((id) => !baseDatos.caracteristicas.find((c) => c.idCaracteristica === id)?.activa)
          mesa.caracteristicas = [...new Set([...cambio.caracteristicas, ...inactivas])]
        }
        if (cambio.activa !== undefined) mesa.activa = cambio.activa
        return aMesaAdmin(mesa)
      })
    },

    eliminarMesa(id) {
      return conRetraso(() => {
        const mesa = baseDatos.mesas.find((m) => m.idMesa === id)
        if (!mesa) throw noExiste('La mesa')
        if (elimMesas.has(id)) throw new ErrorServicio('estado_invalido', 'La mesa ya está eliminada.', 409)
        exigirMesaSinUsoMock(mesa, 'eliminarla')
        mesa.activa = false
        elimMesas.set(id, new Date())
        return aMesaAdmin(mesa)
      })
    },

    restaurarMesa(id) {
      return conRetraso(() => {
        const mesa = baseDatos.mesas.find((m) => m.idMesa === id)
        if (!mesa) throw noExiste('La mesa')
        if (!elimMesas.has(id)) throw new ErrorServicio('estado_invalido', 'La mesa no está eliminada.', 409)
        if (elimSecciones.has(mesa.zona ?? '')) throw new ErrorServicio('estado_invalido', 'Su sección está eliminada. Restaura primero la sección o pasa la mesa a otra.', 409)
        elimMesas.delete(id)
        return aMesaAdmin(mesa)
      })
    },

    listarCategorias(opciones) {
      return conRetraso(() =>
        opciones?.eliminados
          ? categoriasEliminadas.map((c): CategoriaAdmin => ({ idCategoria: c.idCategoria, nombre: c.nombre, totalProductos: 0, eliminadoEn: c.eliminadoEn }))
          : baseDatos.categorias.map((c) => aCategoria(c.idCategoria)),
      )
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
        // Todo o nada: un producto en un pedido sin entregar frena toda la categoría.
        for (const p of c.productos) {
          const enPedido = baseDatos.pedidos.filter((pe) => estaSinEntregar(pe.estado) && pe.detalle.some((l) => l.idProducto === p.idProducto)).length
          if (enPedido > 0) {
            enCascadaMock(c.nombre, () => {
              throw new ErrorServicio(
                'estado_invalido',
                `«${p.nombre}» está en ${enPedido} pedido(s) que aún no se entregan. Espera a que se entreguen o cancélalos; mientras tanto puedes desactivarlo.`,
                409,
              )
            })
          }
        }
        const ahora = ahoraDeCascada(productosEliminados.filter((e) => e.producto.idCategoria === id).map((e) => e.eliminadoEn))
        for (const p of [...c.productos]) productosEliminados.push({ producto: p, eliminadoEn: ahora })
        c.productos = []
        baseDatos.categorias.splice(baseDatos.categorias.indexOf(c), 1)
        categoriasEliminadas.push({ idCategoria: c.idCategoria, nombre: c.nombre, eliminadoEn: ahora })
      })
    },

    restaurarCategoria(id) {
      return conRetraso(() => {
        const e = categoriasEliminadas.find((x) => x.idCategoria === id)
        if (!e) throw noExiste('La categoría eliminada')
        categoriasEliminadas.splice(categoriasEliminadas.indexOf(e), 1)
        const productos: Producto[] = []
        // Vuelven los productos que se eliminaron CON la categoría.
        for (const p of [...productosEliminados]) {
          if (p.producto.idCategoria === id && p.eliminadoEn.getTime() === e.eliminadoEn.getTime()) {
            productosEliminados.splice(productosEliminados.indexOf(p), 1)
            productos.push(p.producto)
          }
        }
        baseDatos.categorias.push({ idCategoria: e.idCategoria, nombre: e.nombre, productos })
        baseDatos.categorias.sort((a, b) => a.idCategoria - b.idCategoria)
        for (const p of productos) sincronizarDisponible(p.idProducto)
        return aCategoria(id)
      })
    },

    listarProductos(opciones) {
      return conRetraso(() =>
        opciones?.eliminados
          ? productosEliminados.map(aProductoEliminado)
          : baseDatos.categorias.flatMap((c) => c.productos.map((p) => aProductoAdmin(p.idProducto))),
      )
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
        if (productosEliminados.some((e) => e.producto.idCategoria === n.idCategoria && claveProducto(e.producto.nombre) === nombre && claveProducto(e.producto.presentacion ?? '') === presentacion)) {
          throw new ErrorServicio('estado_invalido', 'Hay un producto eliminado con esa categoría, nombre y presentación. Restáuralo desde «Eliminados» en lugar de crear otro.', 409)
        }
        const id = Math.max(0, ...baseDatos.categorias.flatMap((k) => k.productos.map((p) => p.idProducto)), ...productosEliminados.map((e) => e.producto.idProducto)) + 1
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

    eliminarProducto(id) {
      return conRetraso(() => {
        if (productosEliminados.some((e) => e.producto.idProducto === id)) throw new ErrorServicio('estado_invalido', 'El producto ya está eliminado.', 409)
        const actual = aProductoAdmin(id) // 404 si no existe
        const enPedido = baseDatos.pedidos.filter((p) => estaSinEntregar(p.estado) && p.detalle.some((l) => l.idProducto === id)).length
        if (enPedido > 0) {
          throw new ErrorServicio(
            'estado_invalido',
            `«${actual.nombre}» está en ${enPedido} pedido(s) que aún no se entregan. Espera a que se entreguen o cancélalos; mientras tanto puedes desactivarlo.`,
            409,
          )
        }
        const origen = baseDatos.categorias.find((k) => k.idCategoria === actual.idCategoria)!
        const p = origen.productos.find((x) => x.idProducto === id)!
        origen.productos.splice(origen.productos.indexOf(p), 1)
        const e: ProductoEliminado = { producto: p, eliminadoEn: new Date() }
        productosEliminados.push(e)
        return aProductoEliminado(e)
      })
    },

    restaurarProducto(id) {
      return conRetraso(() => {
        const e = productosEliminados.find((x) => x.producto.idProducto === id)
        if (!e) throw new ErrorServicio('estado_invalido', 'El producto no está eliminado.', 409)
        const categoria = baseDatos.categorias.find((k) => k.idCategoria === e.producto.idCategoria)
        if (!categoria) throw new ErrorServicio('estado_invalido', 'Su categoría está eliminada. Restaura primero la categoría.', 409)
        productosEliminados.splice(productosEliminados.indexOf(e), 1)
        categoria.productos.push(e.producto)
        sincronizarDisponible(id)
        return aProductoAdmin(id)
      })
    },
  }
}
