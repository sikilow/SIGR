// Reglas del servicio simulado. Cada prueba parte de una "base de datos" recién creada
// (se reimportan los módulos) y usa temporizadores falsos para no esperar el retraso de red.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
async function nuevoMock() {
  vi.resetModules()
  const [{ crearPedidosMock }, { crearCuentasMock }, { crearMesasMock }, { baseDatos }] = await Promise.all([
    import('./pedidosMock'),
    import('./cuentasMock'),
    import('./mesasMock'),
    import('./baseDatos'),
  ])
  return { pedidos: crearPedidosMock(), cuentas: crearCuentasMock(), mesas: crearMesasMock(), baseDatos }
}

/** Deja correr el retraso simulado de red y devuelve el resultado de la promesa. */
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

async function codigoDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await resolver(promesa)
  } catch (e) {
    // Se lee `codigo` sin `instanceof`: tras resetModules la clase ErrorServicio es otra instancia.
    const codigo = (e as { codigo?: string }).codigo
    if (codigo) return codigo
    throw e
  }
  return 'sin error'
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// Datos sembrados: #3 en_preparacion, #2 listo, #5 enviado, #6 registrado, #4 entregado, #8 cancelado, #10 pagado.
describe('mock: cancelar pedido', () => {
  it('en_preparacion devuelve requiere_gerente y no cambia el pedido', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    expect(await codigoDeError(pedidos.cancelar(3, 'Demora excesiva'))).toBe('requiere_gerente')
    expect(baseDatos.pedidos.find((p) => p.id === 3)?.estado).toBe('en_preparacion')
  })

  it.each([
    [2, 'listo'],
    [4, 'entregado'],
    [8, 'cancelado'],
    [10, 'pagado'],
  ])('el pedido #%i (%s) devuelve estado_invalido', async (id) => {
    const { pedidos } = await nuevoMock()
    expect(await codigoDeError(pedidos.cancelar(id, 'Error al tomar el pedido'))).toBe('estado_invalido')
  })

  it.each([
    [6, 'registrado'],
    [5, 'enviado'],
  ])('en %2$s funciona: queda cancelado con su motivo', async (id) => {
    const { pedidos } = await nuevoMock()
    const pedido = await resolver(pedidos.cancelar(id, '  El cliente cambió de opinión '))
    expect(pedido.estado).toBe('cancelado')
    expect(pedido.motivoCancelacion).toBe('El cliente cambió de opinión')
  })

  it('exige un motivo de 5 a 200 caracteres', async () => {
    const { pedidos } = await nuevoMock()
    expect(await codigoDeError(pedidos.cancelar(6, 'abc'))).toBe('estado_invalido')
    expect(await codigoDeError(pedidos.cancelar(6, 'x'.repeat(201)))).toBe('estado_invalido')
  })

  it('con la cuenta por_pagar devuelve estado_invalido (suposición documentada)', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    const cuenta = baseDatos.cuentas.find((c) => c.id === 4) // mesa 11: pedidos #5 y #6
    if (cuenta) cuenta.estado = 'por_pagar'
    expect(await codigoDeError(pedidos.cancelar(6, 'Error al tomar el pedido'))).toBe('estado_invalido')
  })

  it('recalcula el total de la cuenta sin el pedido cancelado', async () => {
    const { pedidos, cuentas } = await nuevoMock()
    const antes = await resolver(cuentas.obtenerPorMesa(11))
    expect(antes?.total).toBe(310) // #5 (230) + #6 (80)
    await resolver(pedidos.cancelar(6, 'Error al tomar el pedido'))
    const despues = await resolver(cuentas.obtenerPorMesa(11))
    expect(despues?.total).toBe(230)
  })

  it('la mesa 12 trae un pedido cancelado que no suma al total', async () => {
    const { cuentas } = await nuevoMock()
    const cuenta = await resolver(cuentas.obtenerPorMesa(12))
    expect(cuenta?.pedidos.find((p) => p.estado === 'cancelado')?.motivoCancelacion).toBe('El cliente cambió de opinión')
    expect(cuenta?.total).toBe(555) // #7 (240) + #9 (315); el cancelado de 140 no suma
  })
})

describe('mock: entregar pedido', () => {
  it('solo desde listo', async () => {
    const { pedidos } = await nuevoMock()
    const entregado = await resolver(pedidos.entregar(2))
    expect(entregado.estado).toBe('entregado')
  })

  it.each([
    [6, 'registrado'],
    [5, 'enviado'],
    [3, 'en_preparacion'],
    [4, 'entregado'],
    [8, 'cancelado'],
    [10, 'pagado'],
  ])('el pedido #%i (%s) devuelve estado_invalido', async (id) => {
    const { pedidos } = await nuevoMock()
    expect(await codigoDeError(pedidos.entregar(id))).toBe('estado_invalido')
  })

  it('al entregar desaparece el "pedido listo" de la mesa', async () => {
    const { pedidos, mesas } = await nuevoMock()
    expect((await resolver(mesas.listar())).find((m) => m.id === 3)?.pedidosListos).toBe(1)
    await resolver(pedidos.entregar(2))
    expect((await resolver(mesas.listar())).find((m) => m.id === 3)?.pedidosListos).toBe(0)
  })
})

describe('mock: solicitar cuenta', () => {
  it('pasa la cuenta de abierta a por_pagar y guarda el tipo de pago', async () => {
    const { cuentas, mesas } = await nuevoMock()
    const cuenta = await resolver(cuentas.solicitarPago(1, 'digital'))
    expect(cuenta.estado).toBe('por_pagar')
    expect(cuenta.tipoPagoSolicitado).toBe('digital')
    expect((await resolver(mesas.listar())).find((m) => m.id === 3)?.estadoCuenta).toBe('por_pagar')
  })

  it('si la cuenta ya no está abierta devuelve estado_invalido', async () => {
    const { cuentas } = await nuevoMock()
    expect(await codigoDeError(cuentas.solicitarPago(3, 'fisico'))).toBe('estado_invalido') // la 3 ya está por_pagar
    await resolver(cuentas.solicitarPago(1, 'fisico'))
    expect(await codigoDeError(cuentas.solicitarPago(1, 'digital'))).toBe('estado_invalido')
  })

  it('una cuenta sin pedidos vigentes no se puede solicitar (total 0)', async () => {
    const { cuentas, baseDatos } = await nuevoMock()
    baseDatos.pedidos.filter((p) => p.cuentaId === 1).forEach((p) => (p.estado = 'cancelado'))
    expect(await codigoDeError(cuentas.solicitarPago(1, 'fisico'))).toBe('estado_invalido')
  })

  it('una cuenta inexistente devuelve no_encontrado', async () => {
    const { cuentas } = await nuevoMock()
    expect(await codigoDeError(cuentas.solicitarPago(999, 'fisico'))).toBe('no_encontrado')
  })
})

describe('mock: Idempotency-Key', () => {
  it('repetir la misma clave devuelve el resultado anterior en vez de repetir la acción', async () => {
    const { pedidos } = await nuevoMock()
    const primero = await resolver(pedidos.cancelar(6, 'Error al tomar el pedido', 'clave-1'))
    // Sin clave, repetir fallaría (ya está cancelado); con la misma clave devuelve lo mismo.
    const repetido = await resolver(pedidos.cancelar(6, 'Error al tomar el pedido', 'clave-1'))
    expect(repetido).toEqual(primero)
    expect(await codigoDeError(pedidos.cancelar(6, 'Error al tomar el pedido'))).toBe('estado_invalido')
  })

  it('registrar con la misma clave no duplica el pedido', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    const nuevo = { mesaId: 11, detalle: [{ productoId: 14, cantidad: 1, observaciones: '' }] }
    const total0 = baseDatos.pedidos.length
    const a = await resolver(pedidos.crear(nuevo, 'k-registro'))
    const b = await resolver(pedidos.crear(nuevo, 'k-registro'))
    expect(b.id).toBe(a.id)
    expect(baseDatos.pedidos.length).toBe(total0 + 1)
    // otra intención (otra clave) sí crea otro pedido
    const c = await resolver(pedidos.crear(nuevo, 'k-registro-2'))
    expect(c.id).not.toBe(a.id)
  })

  it('un error no consume la clave', async () => {
    const { pedidos } = await nuevoMock()
    expect(await codigoDeError(pedidos.cancelar(3, 'Demora excesiva', 'k-error'))).toBe('requiere_gerente')
    expect(await codigoDeError(pedidos.cancelar(3, 'Demora excesiva', 'k-error'))).toBe('requiere_gerente')
  })
})
