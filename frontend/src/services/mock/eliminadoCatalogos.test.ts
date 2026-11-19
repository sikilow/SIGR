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
  it('categoría con métodos vigentes no se elimina; el de efectivo tampoco; se restauran en orden', async () => {
    const { catalogo } = await nuevo()
    const categoria = await resolver(catalogo.crearCategoriaMetodoPago('Vales', 'digital'))
    const metodo = await resolver(catalogo.crearMetodoPago('Vale despensa', categoria.idCategoriaMetodoPago, false))
    expect(await mensajeDeError(catalogo.eliminarCategoriaMetodoPago(categoria.idCategoriaMetodoPago))).toMatch(/método/)

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
    expect((await resolver(catalogo.restaurarMetodoPago(metodo.idMetodo))).activo).toBe(false)
  })
})
