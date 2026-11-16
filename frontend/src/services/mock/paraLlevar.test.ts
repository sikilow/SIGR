// Pedidos para llevar (mock): mesas virtuales de la sección «Para llevar» y canales de pedido.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function nuevoMock() {
  vi.resetModules()
  const [{ crearCatalogoMock }, { crearMesasMock }, { crearHostessMock }, { crearPedidosMock }, { crearCajaMock }] = await Promise.all([
    import('./adminMock'),
    import('./mesasMock'),
    import('../hostess/mock'),
    import('./pedidosMock'),
    import('./cajaMock'),
  ])
  return { catalogo: crearCatalogoMock(), mesas: crearMesasMock(), hostess: crearHostessMock(), pedidos: crearPedidosMock(), caja: crearCajaMock() }
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

async function errorDe(promesa: Promise<unknown>): Promise<{ codigo: string; mensaje: string }> {
  try {
    await resolver(promesa)
  } catch (e) {
    const err = e as { codigo?: string; message?: string }
    if (err.codigo) return { codigo: err.codigo, mensaje: err.message ?? '' }
    throw e
  }
  throw new Error('Se esperaba un error y no hubo ninguno')
}

function iniciarSesionMesero(): void {
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn((clave: string) => (clave === 'sigr.mock.sesion' ? JSON.stringify({ id: 1 }) : null)),
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('mesas virtuales de «Para llevar»', () => {
  it('el mesero las ve (con su marca) y la hostess no existe para ella', async () => {
    const { mesas, hostess } = await nuevoMock()
    const delMesero = await resolver(mesas.listar())
    expect(delMesero.filter((m) => m.esParaLlevar).map((m) => m.numero)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110])
    expect((await resolver(hostess.listarMesas())).some((m) => m.numero >= 101)).toBe(false)
  })

  it('abrir un pedido para llevar ocupa la primera mesa libre y guarda el canal y la referencia', async () => {
    const { mesas } = await nuevoMock()
    const apertura = await resolver(mesas.abrirParaLlevar(3, ' Juan P. '))
    expect(apertura).toMatchObject({ numero: 101, canal: 'Rappi', referencia: 'Juan P.' })

    const mesa = (await resolver(mesas.listar())).find((m) => m.numero === 101)!
    expect(mesa).toMatchObject({ estado: 'ocupada', esParaLlevar: true, canal: 'Rappi', referencia: 'Juan P.' })
    // La siguiente apertura toma la 102.
    expect((await resolver(mesas.abrirParaLlevar(1, null))).numero).toBe(102)
  })

  it('el pedido de esa mesa lleva el canal y la cuenta llega a Caja con el canal', async () => {
    const { mesas, pedidos } = await nuevoMock()
    iniciarSesionMesero()
    const apertura = await resolver(mesas.abrirParaLlevar(4, 'Folio 88'))
    const pedido = await resolver(
      pedidos.crear({ idMesa: apertura.idMesa, detalle: [{ idProducto: 1, cantidad: 2, indicaciones: 'para llevar' }] }),
    )
    expect(pedido).toMatchObject({ mesaNumero: 101, canal: 'Uber Eats' })
  })

  it('rechaza un canal desactivado y avisa cuando ya no quedan mesas libres', async () => {
    const { mesas, catalogo } = await nuevoMock()
    await resolver(catalogo.actualizarCanal(3, { activo: false }))
    expect((await errorDe(mesas.abrirParaLlevar(3, null))).codigo).toBe('estado_invalido')

    for (let i = 0; i < 10; i += 1) await resolver(mesas.abrirParaLlevar(1, null))
    const e = await errorDe(mesas.abrirParaLlevar(1, null))
    expect(e.codigo).toBe('mesa_no_disponible')
    expect(e.mensaje).toContain('Para llevar')
  })

  it('libera una mesa sin pedidos, pero no una con productos ni una mesa normal', async () => {
    const { mesas, pedidos } = await nuevoMock()
    iniciarSesionMesero()
    const vacia = await resolver(mesas.abrirParaLlevar(1, null))
    await resolver(mesas.liberarParaLlevar(vacia.idMesa))
    expect((await resolver(mesas.listar())).find((m) => m.numero === 101)?.estado).toBe('libre')

    const conProductos = await resolver(mesas.abrirParaLlevar(2, null))
    await resolver(pedidos.crear({ idMesa: conProductos.idMesa, detalle: [{ idProducto: 1, cantidad: 1, indicaciones: '' }] }))
    expect((await errorDe(mesas.liberarParaLlevar(conProductos.idMesa))).codigo).toBe('estado_invalido')
    expect((await errorDe(mesas.liberarParaLlevar(1))).codigo).toBe('estado_invalido')
  })
})

describe('canales de pedido', () => {
  it('Gerencia agrega y desactiva canales; el mesero solo ve los activos', async () => {
    const { catalogo } = await nuevoMock()
    const nuevo = await resolver(catalogo.crearCanal(' Cornershop '))
    expect(nuevo).toMatchObject({ nombre: 'Cornershop', activo: true })
    expect((await errorDe(catalogo.crearCanal('cornershop'))).codigo).toBe('estado_invalido')

    await resolver(catalogo.actualizarCanal(nuevo.idCanal, { activo: false }))
    expect((await resolver(catalogo.listarCanalesDisponibles())).map((c) => c.nombre)).not.toContain('Cornershop')
    expect((await resolver(catalogo.listarCanales())).map((c) => c.nombre)).toContain('Cornershop')
  })
})
