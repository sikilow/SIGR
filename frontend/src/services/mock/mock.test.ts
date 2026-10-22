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

function iniciarSesionMesero(idUsuario = 1): void {
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn((clave: string) =>
      clave === 'sigr.mock.sesion'
        ? JSON.stringify({ idUsuario, idRol: 2, nombre: 'Mesero', correo: '', activo: true, rol: 'mesero' })
        : null,
    ),
  })
}

function iniciarSesionGerente(): void {
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn((clave: string) =>
      clave === 'sigr.mock.sesion'
        ? JSON.stringify({ idUsuario: 2, idRol: 1, nombre: 'Luis Ramírez', correo: '', activo: true, rol: 'gerente' })
        : null,
    ),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Datos sembrados: #3 en_preparacion, #2 listo, #5 pendiente (enviado a cocina), #6 registrado, #4 entregado, #8 cancelado, #10 pagado.
describe('mock: propiedad de pedidos del mesero', () => {
  it('lista y permite consultar pedidos creados por otros meseros', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    iniciarSesionMesero()
    baseDatos.usuarios.push({
      idUsuario: 5, idRol: 2, nombre: 'Rosa Mesera', correo: '', activo: true,
      rol: 'mesero', nombreUsuario: 'mesero2', contrasena: '1234',
    })
    const ajeno = baseDatos.pedidos.find((pedido) => pedido.idPedido === 6)
    if (ajeno) {
      ajeno.idMesero = 5
      ajeno.nombreMesero = 'Rosa Mesera'
    }

    const lista = await resolver(pedidos.listar())

    expect(lista.some((pedido) => pedido.idPedido === 6 && pedido.nombreMesero === 'Rosa Mesera')).toBe(true)
    expect((await resolver(pedidos.obtener(6))).nombreMesero).toBe('Rosa Mesera')
  })

  it('deniega cambiar pedidos de otro mesero', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    iniciarSesionMesero()
    baseDatos.usuarios.push({
      idUsuario: 5, idRol: 2, nombre: 'Rosa Mesera', correo: '', activo: true,
      rol: 'mesero', nombreUsuario: 'mesero2', contrasena: '1234',
    })
    for (const idPedido of [2, 6]) {
      const pedido = baseDatos.pedidos.find((p) => p.idPedido === idPedido)
      if (pedido) {
        pedido.idMesero = 5
        pedido.nombreMesero = 'Rosa Mesera'
      }
    }

    expect(await codigoDeError(pedidos.actualizar(6, [{ idProducto: 1, cantidad: 1, indicaciones: '' }]))).toBe('sin_permiso')
    expect(await codigoDeError(pedidos.enviar(6))).toBe('sin_permiso')
    expect(await codigoDeError(pedidos.cancelar(6, 'Error al tomar el pedido'))).toBe('sin_permiso')
    expect(await codigoDeError(pedidos.entregar(2))).toBe('sin_permiso')
    expect(baseDatos.pedidos.find((p) => p.idPedido === 2)?.estado).toBe('listo')
    expect(baseDatos.pedidos.find((p) => p.idPedido === 6)?.estado).toBe('registrado')
  })
})

describe('mock: cancelar pedido', () => {
  it('en_preparacion devuelve requiere_gerente y no cambia el pedido', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    expect(await codigoDeError(pedidos.cancelar(3, 'Demora excesiva'))).toBe('requiere_gerente')
    expect(baseDatos.pedidos.find((p) => p.idPedido === 3)?.estado).toBe('en_preparacion')
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
    [5, 'pendiente'],
  ])('en %2$s funciona: queda cancelado con su motivo', async (id) => {
    const { pedidos } = await nuevoMock()
    const pedido = await resolver(pedidos.cancelar(id, '  El cliente cambió de opinión '))
    expect(pedido.estado).toBe('cancelado')
    expect(pedido.motivoDescripcion).toBe('El cliente cambió de opinión')
    expect(pedido.idMotivo).toEqual(expect.any(Number))
  })

  it('exige un motivo de 5 a 200 caracteres', async () => {
    const { pedidos } = await nuevoMock()
    expect(await codigoDeError(pedidos.cancelar(6, 'abc'))).toBe('estado_invalido')
    expect(await codigoDeError(pedidos.cancelar(6, 'x'.repeat(201)))).toBe('estado_invalido')
  })

  it('acepta un motivo de exactamente 200 caracteres', async () => {
    const { pedidos } = await nuevoMock()
    const pedido = await resolver(pedidos.cancelar(6, 'x'.repeat(200)))
    expect(pedido.motivoDescripcion).toHaveLength(200)
  })

  it('con la cuenta por_pagar devuelve estado_invalido (suposición documentada)', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    const cuenta = baseDatos.cuentas.find((c) => c.idCuenta === 4) // mesa 11: pedidos #5 y #6
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
    expect(cuenta?.pedidos.find((p) => p.estado === 'cancelado')?.motivoDescripcion).toBe('El cliente cambió de opinión')
    expect(cuenta?.total).toBe(555) // #7 (240) + #9 (315); el cancelado de 140 no suma
  })
})

describe('mock: enviar pedido', () => {
  it('un pedido registrado pasa a pendiente (el catálogo de la BD no tiene "enviado")', async () => {
    const { pedidos } = await nuevoMock()
    const enviado = await resolver(pedidos.enviar(6))
    expect(enviado.estado).toBe('pendiente')
  })

  it('un pedido que ya no está registrado devuelve estado_invalido', async () => {
    const { pedidos } = await nuevoMock()
    expect(await codigoDeError(pedidos.enviar(5))).toBe('estado_invalido') // #5 ya está pendiente
  })
})

describe('mock: cambiar estado desde cocina', () => {
  it('pasa de enviado a preparación y de preparación a listo', async () => {
    const { pedidos } = await nuevoMock()
    expect((await resolver(pedidos.cambiarEstadoCocina(5, 'en_preparacion'))).estado).toBe('en_preparacion')
    expect((await resolver(pedidos.cambiarEstadoCocina(5, 'listo'))).estado).toBe('listo')
  })

  it('no permite saltarse estados ni cambiar un pedido que ya no está en cola', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    expect(await codigoDeError(pedidos.cambiarEstadoCocina(5, 'listo'))).toBe('estado_invalido')
    expect(baseDatos.pedidos.find((p) => p.idPedido === 5)?.estado).toBe('pendiente')
    expect(await codigoDeError(pedidos.cambiarEstadoCocina(2, 'listo'))).toBe('estado_invalido')
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
    [5, 'pendiente'],
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
    expect((await resolver(mesas.listar())).find((m) => m.idMesa === 3)?.pedidosListos).toBe(1)
    await resolver(pedidos.entregar(2))
    expect((await resolver(mesas.listar())).find((m) => m.idMesa === 3)?.pedidosListos).toBe(0)
  })
})

describe('mock: sección de las mesas del panel (RF-MES-007)', () => {
  it('el panel recibe la sección (o null) y no la disponibilidad, como GET /mesas', async () => {
    const { mesas } = await nuevoMock()
    const lista = await resolver(mesas.listar())
    expect(lista.find((m) => m.numero === 1)?.zona).toBe('Salón')
    expect(lista.find((m) => m.numero === 9)?.zona).toBe('Terraza')
    expect(lista.find((m) => m.numero === 15)?.zona).toBe('Barra')
    expect(lista.find((m) => m.numero === 18)?.zona).toBeNull()
    expect(lista.every((m) => !('activa' in m))).toBe(true)
  })
})

describe('mock: solicitar cuenta', () => {
  it('pasa la cuenta de abierta a por_pagar y guarda el tipo de pago', async () => {
    const { cuentas, mesas } = await nuevoMock()
    const cuenta = await resolver(cuentas.solicitarPago(1, 'digital'))
    expect(cuenta.estado).toBe('por_pagar')
    expect(cuenta.tipoPagoSolicitado).toBe('digital')
    expect((await resolver(mesas.listar())).find((m) => m.idMesa === 3)?.estadoCuenta).toBe('por_pagar')
  })

  it('si la cuenta ya no está abierta devuelve estado_invalido', async () => {
    const { cuentas } = await nuevoMock()
    expect(await codigoDeError(cuentas.solicitarPago(3, 'fisico'))).toBe('estado_invalido') // la 3 ya está por_pagar
    await resolver(cuentas.solicitarPago(1, 'fisico'))
    expect(await codigoDeError(cuentas.solicitarPago(1, 'digital'))).toBe('estado_invalido')
  })

  it('una cuenta sin pedidos vigentes no se puede solicitar (total 0)', async () => {
    const { cuentas, baseDatos } = await nuevoMock()
    baseDatos.pedidos.filter((p) => p.idCuenta === 1).forEach((p) => (p.estado = 'cancelado'))
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
    const nuevo = { idMesa: 11, detalle: [{ idProducto: 14, cantidad: 1, indicaciones: '' }] }
    const total0 = baseDatos.pedidos.length
    const a = await resolver(pedidos.crear(nuevo, 'k-registro'))
    const b = await resolver(pedidos.crear(nuevo, 'k-registro'))
    expect(b.idPedido).toBe(a.idPedido)
    expect(baseDatos.pedidos.length).toBe(total0 + 1)
    // otra intención (otra clave) sí crea otro pedido
    const c = await resolver(pedidos.crear(nuevo, 'k-registro-2'))
    expect(c.idPedido).not.toBe(a.idPedido)
  })

  it('un error no consume la clave', async () => {
    const { pedidos } = await nuevoMock()
    expect(await codigoDeError(pedidos.cancelar(3, 'Demora excesiva', 'k-error'))).toBe('requiere_gerente')
    expect(await codigoDeError(pedidos.cancelar(3, 'Demora excesiva', 'k-error'))).toBe('requiere_gerente')
  })
})

// Pantalla Pedidos del gerente (/gerente/pedidos): RF-PED-002 (gerente), RF-PED-003 y RF-PED-005.
describe('mock: datos para la pantalla Pedidos del gerente', () => {
  it('trae pedidos de dos meseros, de varios estados y de días anteriores', async () => {
    const { pedidos } = await nuevoMock()
    const lista = await resolver(pedidos.listar())
    expect(new Set(lista.map((p) => p.nombreMesero))).toEqual(new Set(['Ana Torres', 'Rosa Mesera']))
    const estados = new Set(lista.map((p) => p.estado))
    for (const estado of ['registrado', 'pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado', 'pagado'] as const) {
      expect(estados.has(estado)).toBe(true)
    }
    const inicioDeHoy = new Date()
    inicioDeHoy.setHours(0, 0, 0, 0)
    expect(lista.some((p) => p.fechaHora < inicioDeHoy)).toBe(true)
  })
})

describe('mock: el gerente cancela como excepción', () => {
  it('cancela un pedido en preparación de otro mesero, con su motivo', async () => {
    const { pedidos } = await nuevoMock()
    iniciarSesionGerente()
    const pedido = await resolver(pedidos.cancelar(9, 'Demora excesiva', 'k-gerente'))
    expect(pedido.estado).toBe('cancelado')
    expect(pedido.motivoDescripcion).toBe('Demora excesiva')
    expect(pedido.nombreMesero).toBe('Rosa Mesera')
  })

  it.each([
    [2, 'listo'],
    [4, 'entregado'],
    [8, 'cancelado'],
    [10, 'pagado'],
  ])('tampoco el gerente cancela el pedido #%i (%s)', async (id) => {
    const { pedidos } = await nuevoMock()
    iniciarSesionGerente()
    expect(await codigoDeError(pedidos.cancelar(id, 'Error al tomar el pedido'))).toBe('estado_invalido')
  })

  it('con la cuenta por pagar el gerente recibe estado_invalido', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    iniciarSesionGerente()
    const cuenta = baseDatos.cuentas.find((c) => c.idCuenta === 5) // mesa 12: #9 en preparación
    if (cuenta) cuenta.estado = 'por_pagar'
    expect(await codigoDeError(pedidos.cancelar(9, 'Demora excesiva'))).toBe('estado_invalido')
  })

  it('el mesero sigue sin poder cancelar su pedido en preparación', async () => {
    const { pedidos, baseDatos } = await nuevoMock()
    iniciarSesionMesero(1)
    expect(await codigoDeError(pedidos.cancelar(3, 'Demora excesiva'))).toBe('requiere_gerente')
    expect(baseDatos.pedidos.find((p) => p.idPedido === 3)?.estado).toBe('en_preparacion')
  })
})
