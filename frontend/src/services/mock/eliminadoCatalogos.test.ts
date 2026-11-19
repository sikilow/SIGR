import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Eliminado lógico de mesas, secciones, canales, categorías y métodos de pago en la demo (migración 029). Lo eliminado
// sale de las listas, queda también inactivo y se restaura (inactivo).

async function nuevo() {
  vi.resetModules()
  const [{ crearCatalogoMock }, { baseDatos }] = await Promise.all([import('./adminMock'), import('./baseDatos')])
  return { catalogo: crearCatalogoMock(), baseDatos }
}

async function resolver<T>(promesa: Promise<T>): Promise<T> {
  const lista = promesa.then(
    (valor) => ({ valor }),
    (error: unknown) => ({ error }),
  )
  await vi.advanceTimersByTimeAsync(400)
  const r = await lista
  if ('error' in r) throw r.error
  return r.valor
}

async function mensajeDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await resolver(promesa)
  } catch (e) {
    return (e as { message?: string }).message ?? ''
  }
  throw new Error('Se esperaba un error')
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('mesas y secciones', () => {
  it('una mesa eliminada sale de la lista, queda no disponible y se restaura; su número sigue ocupado', async () => {
    const { catalogo } = await nuevo()
    await resolver(catalogo.crearSeccion('Jardín'))
    const mesa = await resolver(catalogo.crearMesa({ numero: 60, capacidad: 4, zona: 'Jardín', activa: true, caracteristicas: [] }))

    const eliminada = await resolver(catalogo.eliminarMesa(mesa.idMesa))
    expect(eliminada).toMatchObject({ activa: false })
    expect(eliminada.eliminadoEn).toBeInstanceOf(Date)
    expect((await resolver(catalogo.listarMesas())).some((m) => m.idMesa === mesa.idMesa)).toBe(false)
    expect((await resolver(catalogo.listarMesas({ eliminados: true }))).map((m) => m.idMesa)).toEqual([mesa.idMesa])
    expect(await mensajeDeError(catalogo.crearMesa({ numero: 60, capacidad: 2, zona: 'Jardín', activa: true, caracteristicas: [] }))).toMatch(/eliminada/)
    expect(await mensajeDeError(catalogo.actualizarMesa(mesa.idMesa, { capacidad: 8 }))).toMatch(/eliminada/)

    const restaurada = await resolver(catalogo.restaurarMesa(mesa.idMesa))
    expect(restaurada.eliminadoEn).toBeNull()
    expect(restaurada.activa).toBe(false)
  })

  it('no se eliminan mesas ocupadas, ni secciones con mesas vigentes ni «Para llevar»; no se restaura una mesa con su sección eliminada', async () => {
    const { catalogo, baseDatos } = await nuevo()
    const ocupada = baseDatos.mesas.find((m) => m.estado !== 'libre')!
    expect(await mensajeDeError(catalogo.eliminarMesa(ocupada.idMesa))).toMatch(/libérala/)
    expect(await mensajeDeError(catalogo.eliminarSeccion(ocupada.zona!))).toMatch(/mesa/)
    if (baseDatos.secciones.some((s) => s.nombre === 'Para llevar')) {
      expect(await mensajeDeError(catalogo.eliminarSeccion('Para llevar'))).toMatch(/sistema/)
    }

    await resolver(catalogo.crearSeccion('Patio'))
    const mesa = await resolver(catalogo.crearMesa({ numero: 61, capacidad: 2, zona: 'Patio', activa: true, caracteristicas: [] }))
    await resolver(catalogo.eliminarMesa(mesa.idMesa))
    await resolver(catalogo.eliminarSeccion('Patio'))
    expect((await resolver(catalogo.listarSecciones({ eliminados: true }))).map((s) => s.nombre)).toEqual(['Patio'])
    expect(await mensajeDeError(catalogo.crearSeccion('Patio'))).toMatch(/eliminada/)
    expect(await mensajeDeError(catalogo.restaurarMesa(mesa.idMesa))).toMatch(/sección está eliminada/)
    const seccion = await resolver(catalogo.restaurarSeccion('Patio'))
    expect(seccion.activa).toBe(false)
    expect((await resolver(catalogo.restaurarMesa(mesa.idMesa))).eliminadoEn).toBeNull()
  })
})

describe('canales', () => {
  it('se elimina y restaura; el nombre sigue ocupado; no mientras una cuenta abierta lo use', async () => {
    const { catalogo, baseDatos } = await nuevo()
    const canal = await resolver(catalogo.crearCanal('Cornershop'))
    const eliminado = await resolver(catalogo.eliminarCanal(canal.idCanal))
    expect(eliminado.activo).toBe(false)
    expect((await resolver(catalogo.listarCanales())).some((c) => c.idCanal === canal.idCanal)).toBe(false)
    expect((await resolver(catalogo.listarCanales({ eliminados: true }))).map((c) => c.idCanal)).toEqual([canal.idCanal])
    expect((await resolver(catalogo.listarCanalesDisponibles())).some((c) => c.idCanal === canal.idCanal)).toBe(false)
    expect(await mensajeDeError(catalogo.crearCanal('Cornershop'))).toMatch(/eliminado/)
    expect((await resolver(catalogo.restaurarCanal(canal.idCanal))).eliminadoEn).toBeNull()

    const enUso = baseDatos.canales[0]!
    baseDatos.cuentas.push({ idCuenta: 999, idMesa: 1, estado: 'abierta', abiertaEn: new Date(), cerradaEn: null, tipoPagoSolicitado: null, idMetodoPagoSolicitado: null, idCanal: enUso.idCanal } as never)
    expect(await mensajeDeError(catalogo.eliminarCanal(enUso.idCanal))).toMatch(/aún no se cobran/)
  })
})

describe('categorías y métodos de pago', () => {
  it('un método se elimina solo; el de efectivo no; el eliminado se restaura inactivo y sigue ocupando su nombre', async () => {
    const { catalogo } = await nuevo()
    const categoria = await resolver(catalogo.crearCategoriaMetodoPago('Vales', 'digital'))
    const metodo = await resolver(catalogo.crearMetodoPago('Vale despensa', categoria.idCategoriaMetodoPago, false))

    const efectivo = (await resolver(catalogo.listarMetodosPago())).flatMap((c) => c.metodos).find((m) => m.esEfectivo)!
    expect(await mensajeDeError(catalogo.eliminarMetodoPago(efectivo.idMetodo))).toMatch(/efectivo/)

    const eliminado = await resolver(catalogo.eliminarMetodoPago(metodo.idMetodo))
    expect(eliminado.activo).toBe(false)
    const vistas = await resolver(catalogo.listarMetodosPago({ eliminados: true }))
    expect(vistas.find((c) => c.idCategoriaMetodoPago === categoria.idCategoriaMetodoPago)?.metodos.map((m) => m.idMetodo)).toEqual([metodo.idMetodo])
    expect((await resolver(catalogo.listarMetodosPagoDisponibles())).some((m) => m.idMetodo === metodo.idMetodo)).toBe(false)
    expect(await mensajeDeError(catalogo.crearMetodoPago('Vale despensa', categoria.idCategoriaMetodoPago, false))).toMatch(/eliminado/)

    await resolver(catalogo.eliminarCategoriaMetodoPago(categoria.idCategoriaMetodoPago))
    expect(await mensajeDeError(catalogo.restaurarMetodoPago(metodo.idMetodo))).toMatch(/categoría está eliminada/)
    expect((await resolver(catalogo.restaurarCategoriaMetodoPago(categoria.idCategoriaMetodoPago))).eliminadoEn).toBeNull()
    // El método se eliminó ANTES que la categoría (por separado): no vuelve con ella, se restaura aparte.
    expect((await resolver(catalogo.restaurarMetodoPago(metodo.idMetodo))).activo).toBe(false)
  })
})

describe('eliminar en cascada', () => {
  it('métodos de pago: eliminar uno elimina solo ese; eliminar la categoría elimina todos; restaurarla devuelve los que se fueron con ella', async () => {
    const { catalogo } = await nuevo()
    const digital = await resolver(catalogo.crearCategoriaMetodoPago('Digital2', 'digital'))
    const crear = (nombre: string) => resolver(catalogo.crearMetodoPago(nombre, digital.idCategoriaMetodoPago, false))
    const tarjeta = await crear('Tarjeta2')
    const transferencia = await crear('Transferencia2')
    const vale = await crear('Vale2')
    const nombresDe = async (eliminados: boolean) =>
      (await resolver(catalogo.listarMetodosPago({ eliminados }))).find((c) => c.idCategoriaMetodoPago === digital.idCategoriaMetodoPago)?.metodos.map((m) => m.nombre).sort() ?? []

    // Uno solo: la categoría y los demás no se tocan.
    await resolver(catalogo.eliminarMetodoPago(transferencia.idMetodo))
    expect(await nombresDe(false)).toEqual(['Tarjeta2', 'Vale2'])
    expect((await resolver(catalogo.listarMetodosPago())).some((c) => c.idCategoriaMetodoPago === digital.idCategoriaMetodoPago)).toBe(true)

    // La categoría completa: se elimina con lo que le quedaba.
    const eliminada = await resolver(catalogo.eliminarCategoriaMetodoPago(digital.idCategoriaMetodoPago))
    expect(eliminada.eliminadoEn).toBeInstanceOf(Date)
    expect((await resolver(catalogo.listarMetodosPago())).some((c) => c.idCategoriaMetodoPago === digital.idCategoriaMetodoPago)).toBe(false)
    expect(await nombresDe(true)).toEqual(['Tarjeta2', 'Transferencia2', 'Vale2'])
    expect((await resolver(catalogo.listarMetodosPagoDisponibles())).some((m) => [tarjeta, vale].some((x) => x.idMetodo === m.idMetodo))).toBe(false)

    // Restaurar: vuelven (inactivos) los que se eliminaron con ella; Transferencia, eliminada antes por separado, no.
    const restaurada = await resolver(catalogo.restaurarCategoriaMetodoPago(digital.idCategoriaMetodoPago))
    expect(restaurada.metodos.map((m) => m.nombre).sort()).toEqual(['Tarjeta2', 'Vale2'])
    expect(restaurada.metodos.every((m) => !m.activo)).toBe(true)
    expect(await nombresDe(true)).toEqual(['Transferencia2'])
  })

  it('métodos de pago: el de efectivo o uno con una cuenta abierta frena toda la categoría y no se elimina nada', async () => {
    const { catalogo, baseDatos } = await nuevo()
    const pago = await resolver(catalogo.listarMetodosPago())
    const fisico = pago.find((c) => c.metodos.some((m) => m.esEfectivo))!
    const mensaje = await mensajeDeError(catalogo.eliminarCategoriaMetodoPago(fisico.idCategoriaMetodoPago))
    expect(mensaje).toMatch(/No se puede eliminar «Físico»/)
    expect(mensaje).toMatch(/efectivo/)
    const despues = (await resolver(catalogo.listarMetodosPago())).find((c) => c.idCategoriaMetodoPago === fisico.idCategoriaMetodoPago)!
    expect(despues.eliminadoEn).toBeNull()
    expect(despues.metodos).toHaveLength(fisico.metodos.length)

    const digital = await resolver(catalogo.crearCategoriaMetodoPago('Digital3', 'digital'))
    const tarjeta = await resolver(catalogo.crearMetodoPago('Tarjeta3', digital.idCategoriaMetodoPago, false))
    await resolver(catalogo.crearMetodoPago('Otro3', digital.idCategoriaMetodoPago, false))
    baseDatos.cuentas.push({ idCuenta: 998, idMesa: 1, estado: 'por_pagar', abiertaEn: new Date(), cerradaEn: null, tipoPagoSolicitado: 'digital', idMetodoPagoSolicitado: tarjeta.idMetodo, idCanal: null } as never)
    const bloqueo = await mensajeDeError(catalogo.eliminarCategoriaMetodoPago(digital.idCategoriaMetodoPago))
    expect(bloqueo).toMatch(/«Digital3»/)
    expect(bloqueo).toMatch(/Tarjeta3.*solicitado/)
    const vigentes = (await resolver(catalogo.listarMetodosPago())).find((c) => c.idCategoriaMetodoPago === digital.idCategoriaMetodoPago)!
    expect(vigentes.metodos.map((m) => m.nombre).sort()).toEqual(['Otro3', 'Tarjeta3'])
  })

  it('secciones: eliminar una mesa elimina solo esa; eliminar la sección elimina todas sus mesas; restaurarla devuelve las que se fueron con ella', async () => {
    const { catalogo } = await nuevo()
    await resolver(catalogo.crearSeccion('Patio2'))
    const crear = (numero: number) => resolver(catalogo.crearMesa({ numero, capacidad: 4, zona: 'Patio2', activa: true, caracteristicas: [] }))
    const m1 = await crear(801)
    await crear(802)
    await crear(803)
    const numerosDe = async (eliminadas: boolean) =>
      (await resolver(catalogo.listarMesas({ eliminados: eliminadas }))).filter((m) => m.zona === 'Patio2').map((m) => m.numero).sort()

    await resolver(catalogo.eliminarMesa(m1.idMesa))
    expect(await numerosDe(false)).toEqual([802, 803])

    await resolver(catalogo.eliminarSeccion('Patio2'))
    expect(await numerosDe(false)).toEqual([])
    expect(await numerosDe(true)).toEqual([801, 802, 803])
    expect((await resolver(catalogo.listarSecciones())).some((s) => s.nombre === 'Patio2')).toBe(false)

    const seccion = await resolver(catalogo.restaurarSeccion('Patio2'))
    expect(seccion.activa).toBe(false)
    expect(await numerosDe(false)).toEqual([802, 803])
    expect(await numerosDe(true)).toEqual([801])
    expect((await resolver(catalogo.listarMesas())).filter((m) => m.zona === 'Patio2').every((m) => !m.activa)).toBe(true)
  })

  it('secciones: una mesa ocupada frena toda la sección y no se elimina nada', async () => {
    const { catalogo, baseDatos } = await nuevo()
    await resolver(catalogo.crearSeccion('Patio3'))
    const libre = await resolver(catalogo.crearMesa({ numero: 811, capacidad: 4, zona: 'Patio3', activa: true, caracteristicas: [] }))
    const ocupada = await resolver(catalogo.crearMesa({ numero: 812, capacidad: 4, zona: 'Patio3', activa: true, caracteristicas: [] }))
    baseDatos.mesas.find((m) => m.idMesa === ocupada.idMesa)!.estado = 'ocupada'
    const mensaje = await mensajeDeError(catalogo.eliminarSeccion('Patio3'))
    expect(mensaje).toMatch(/No se puede eliminar «Patio3»/)
    expect(mensaje).toMatch(/812/)
    expect((await resolver(catalogo.listarMesas())).filter((m) => m.zona === 'Patio3').map((m) => m.idMesa).sort()).toEqual([libre.idMesa, ocupada.idMesa].sort())
    expect((await resolver(catalogo.listarSecciones())).some((s) => s.nombre === 'Patio3')).toBe(true)
  })
})
