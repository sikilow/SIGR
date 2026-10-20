// Reglas del mock de hostess para reservaciones y clientes (H2). Reloj fijo: viernes 16 de octubre de 2026, 12:00.
// Mesas: libres 1, 2, 4, 6 y 9; ocupadas 3, 5, 8, 11 y 12; reservadas 7 (reservación 1) y 10 (reservación 2).
// Reservaciones: #1 confirmada (mesa 7), #2 confirmada (mesa 10), #3 pendiente sin mesa, #4 llegó (mesa 8), #5 cancelada (ayer).
// Clientes: 1 Carlos Medina, 2 Patricia Ruiz, 3 Familia González, 4 Daniel Ortega, 5 Elena Castillo, 6 Héctor Salas,
// 7 Valeria Núñez, 8 Cliente Prueba (sin teléfono).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const AHORA = new Date(2026, 9, 16, 12, 0, 0)
const hoyA = (hora: number, minuto = 0) => new Date(2026, 9, 16, hora, minuto)

async function nuevoMock() {
  vi.resetModules()
  const [{ crearHostessMock }, { baseDatos }] = await Promise.all([import('./mock'), import('../mock/baseDatos')])
  return { hostess: crearHostessMock(), baseDatos }
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
  vi.setSystemTime(AHORA)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mock reservaciones: lista por día', () => {
  it('hoy trae las cuatro de hoy ordenadas por hora; ayer, la cancelada; otro día, nada', async () => {
    const { hostess } = await nuevoMock()
    const hoy = await resolver(hostess.listarReservaciones())
    expect(hoy.map((r) => r.idReservacion)).toEqual([4, 1, 2, 3])
    expect((await resolver(hostess.listarReservaciones('2026-10-15'))).map((r) => r.idReservacion)).toEqual([5])
    expect(await resolver(hostess.listarReservaciones('2026-12-25'))).toEqual([])
  })
})

describe('mock reservaciones: clientes', () => {
  it('busca por nombre (sin acentos) o por teléfono, y pide al menos 2 letras', async () => {
    const { hostess } = await nuevoMock()
    expect((await resolver(hostess.buscarClientes('gonzalez'))).map((c) => c.idCliente)).toEqual([3])
    expect((await resolver(hostess.buscarClientes('nunez'))).map((c) => c.nombre)).toEqual(['Valeria Núñez'])
    expect((await resolver(hostess.buscarClientes('3115550204'))).map((c) => c.idCliente)).toEqual([4])
    expect(await resolver(hostess.buscarClientes('c'))).toEqual([])
    expect(await resolver(hostess.buscarClientes('zzzz'))).toEqual([])
  })

  it('crea un cliente, normaliza el teléfono y deja el correo vacío en null', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const c = await resolver(hostess.crearCliente({ nombre: ' Laura Pérez ', telefono: '(311) 555-0999', correo: '' }))
    expect(c).toEqual({ idCliente: 9, nombre: 'Laura Pérez', telefono: '3115550999', correo: null })
    expect(baseDatos.clientes).toHaveLength(9)
  })

  it('rechaza un teléfono repetido y datos inválidos', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.crearCliente({ nombre: 'Otro', telefono: '311 555 0201', correo: null }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.crearCliente({ nombre: '', telefono: '3115550999', correo: null }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.crearCliente({ nombre: 'Ana', telefono: '123', correo: null }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.crearCliente({ nombre: 'Ana', telefono: '3115550999', correo: 'mal' }))).toBe('estado_invalido')
    expect(baseDatos.clientes).toHaveLength(8)
  })

  it('con la misma Idempotency-Key no duplica el cliente', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const datos = { nombre: 'Laura Pérez', telefono: '3115550999', correo: null }
    const a = await resolver(hostess.crearCliente(datos, 'c-1'))
    const b = await resolver(hostess.crearCliente(datos, 'c-1'))
    expect(b).toEqual(a)
    expect(baseDatos.clientes).toHaveLength(9)
  })
})

describe('mock reservaciones: crear', () => {
  it('sin mesa: nace pendiente y no toca ninguna mesa', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const mesasAntes = structuredClone(baseDatos.mesas)
    const r = await resolver(hostess.crearReservacion({ idCliente: 6, fechaHora: hoyA(20), personas: 3, idMesa: null }))
    expect(r).toMatchObject({ idReservacion: 6, estado: 'pendiente', idMesa: null, mesaNumero: null, clienteNombre: 'Héctor Salas', llegadaEn: null })
    expect(baseDatos.mesas).toEqual(mesasAntes)
  })

  it('con una mesa libre: la mesa pasa a reservada', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.crearReservacion({ idCliente: 6, fechaHora: hoyA(20), personas: 3, idMesa: 4 }))
    expect(r).toMatchObject({ estado: 'pendiente', idMesa: 4, mesaNumero: 4 })
    expect(baseDatos.mesas.find((m) => m.idMesa === 4)?.estado).toBe('reservada')
  })

  it('el Salón ve la mesa reservada y la reservación en la lista de hoy', async () => {
    const { hostess } = await nuevoMock()
    await resolver(hostess.crearReservacion({ idCliente: 6, fechaHora: hoyA(20), personas: 3, idMesa: 4 }))
    const mesas = await resolver(hostess.listarMesas())
    expect(mesas.find((m) => m.idMesa === 4)?.estado).toBe('reservada')
    expect((await resolver(hostess.listarReservaciones())).map((r) => r.idReservacion)).toContain(6)
  })

  it('rechaza mesa ocupada o reservada, y no cambia nada', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.crearReservacion({ idCliente: 6, fechaHora: hoyA(20), personas: 2, idMesa: 3 }))).toBe('mesa_no_disponible')
    expect(await codigoDeError(hostess.crearReservacion({ idCliente: 6, fechaHora: hoyA(20), personas: 2, idMesa: 7 }))).toBe('mesa_no_disponible')
    expect(baseDatos.reservaciones).toHaveLength(5)
  })

  it('no acepta fecha pasada, personas fuera de 1 a 20, cliente inexistente ni mesa para otro día', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const base = { idCliente: 6, fechaHora: hoyA(20), personas: 3, idMesa: null }
    expect(await codigoDeError(hostess.crearReservacion({ ...base, fechaHora: hoyA(11, 59) }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.crearReservacion({ ...base, personas: 0 }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.crearReservacion({ ...base, personas: 21 }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.crearReservacion({ ...base, idCliente: 99 }))).toBe('no_encontrado')
    expect(await codigoDeError(hostess.crearReservacion({ ...base, fechaHora: new Date(2026, 9, 17, 20, 0), idMesa: 4 }))).toBe('estado_invalido')
    expect(baseDatos.reservaciones).toHaveLength(5)
  })

  it('para otro día sin mesa sí se puede', async () => {
    const { hostess } = await nuevoMock()
    const r = await resolver(hostess.crearReservacion({ idCliente: 6, fechaHora: new Date(2026, 9, 17, 20, 0), personas: 2, idMesa: null }))
    expect(r.estado).toBe('pendiente')
    expect((await resolver(hostess.listarReservaciones('2026-10-17'))).map((x) => x.idReservacion)).toEqual([r.idReservacion])
  })

  it('con la misma Idempotency-Key no duplica la reservación', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const datos = { idCliente: 6, fechaHora: hoyA(20), personas: 3, idMesa: 4 }
    const a = await resolver(hostess.crearReservacion(datos, 'r-1'))
    const b = await resolver(hostess.crearReservacion(datos, 'r-1'))
    expect(b).toEqual(a)
    expect(baseDatos.reservaciones).toHaveLength(6)
  })
})

describe('mock reservaciones: confirmar y cancelar', () => {
  it('confirmar pasa de pendiente a confirmada', async () => {
    const { hostess } = await nuevoMock()
    const r = await resolver(hostess.actualizarReservacion(3, { estado: 'confirmada' }))
    expect(r.estado).toBe('confirmada')
  })

  it('una reservación ya confirmada no se vuelve a confirmar', async () => {
    const { hostess } = await nuevoMock()
    expect(await codigoDeError(hostess.actualizarReservacion(1, { estado: 'confirmada' }))).toBe('estado_invalido')
  })

  it('cancelar una reservación con mesa: pasa a cancelada, pierde la mesa y la mesa vuelve a libre', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.actualizarReservacion(1, { estado: 'cancelada' }))
    expect(r).toMatchObject({ estado: 'cancelada', idMesa: null, mesaNumero: null })
    expect(baseDatos.mesas.find((m) => m.idMesa === 7)?.estado).toBe('libre')
  })

  it('si queda otra reservación vigente para la mesa, la mesa sigue reservada', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    baseDatos.reservaciones.push({
      idReservacion: 6, idCliente: 6, idMesa: 7, fechaHora: hoyA(22), personas: 2, estado: 'pendiente', llegadaEn: null,
    })
    await resolver(hostess.actualizarReservacion(1, { estado: 'cancelada' }))
    expect(baseDatos.mesas.find((m) => m.idMesa === 7)?.estado).toBe('reservada')
  })

  it('cancelar una pendiente sin mesa no toca las mesas', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const mesasAntes = structuredClone(baseDatos.mesas)
    await resolver(hostess.actualizarReservacion(3, { estado: 'cancelada' }))
    expect(baseDatos.mesas).toEqual(mesasAntes)
  })

  it('las que ya llegaron o se cancelaron no admiten cambios', async () => {
    const { hostess } = await nuevoMock()
    expect(await codigoDeError(hostess.actualizarReservacion(4, { estado: 'cancelada' }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.actualizarReservacion(5, { estado: 'confirmada' }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.actualizarReservacion(99, { estado: 'cancelada' }))).toBe('no_encontrado')
  })
})

describe('mock reservaciones: editar', () => {
  it('cambia las personas y la hora', async () => {
    const { hostess } = await nuevoMock()
    const r = await resolver(hostess.actualizarReservacion(3, { personas: 8, fechaHora: hoyA(23) }))
    expect(r.personas).toBe(8)
    expect(r.fechaHora).toEqual(hoyA(23))
  })

  it('cambiar de mesa: la nueva queda reservada y la anterior libre', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.actualizarReservacion(1, { idMesa: 4 }))
    expect(r).toMatchObject({ idMesa: 4, mesaNumero: 4 })
    expect(baseDatos.mesas.find((m) => m.idMesa === 4)?.estado).toBe('reservada')
    expect(baseDatos.mesas.find((m) => m.idMesa === 7)?.estado).toBe('libre')
  })

  it('quitar la mesa la libera; ponerle mesa a una que no tenía la reserva', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    await resolver(hostess.actualizarReservacion(1, { idMesa: null }))
    expect(baseDatos.mesas.find((m) => m.idMesa === 7)?.estado).toBe('libre')
    await resolver(hostess.actualizarReservacion(3, { idMesa: 9 }))
    expect(baseDatos.mesas.find((m) => m.idMesa === 9)?.estado).toBe('reservada')
  })

  it('no se puede escoger una mesa ocupada ni reservada por otra', async () => {
    const { hostess } = await nuevoMock()
    expect(await codigoDeError(hostess.actualizarReservacion(3, { idMesa: 3 }))).toBe('mesa_no_disponible')
    expect(await codigoDeError(hostess.actualizarReservacion(3, { idMesa: 10 }))).toBe('mesa_no_disponible')
  })

  it('pasarla a otro día exige quitarle la mesa; quitándola funciona y libera la mesa', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const manana = new Date(2026, 9, 17, 20, 0)
    expect(await codigoDeError(hostess.actualizarReservacion(1, { fechaHora: manana }))).toBe('estado_invalido')
    const r = await resolver(hostess.actualizarReservacion(1, { fechaHora: manana, idMesa: null }))
    expect(r.idMesa).toBeNull()
    expect(baseDatos.mesas.find((m) => m.idMesa === 7)?.estado).toBe('libre')
  })

  it('no acepta una fecha pasada nueva, pero sí dejar la que ya tenía', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.actualizarReservacion(3, { fechaHora: hoyA(9) }))).toBe('estado_invalido')
    // Una reservación cuya hora ya pasó (pero sigue pendiente) todavía se puede editar sin moverle la hora.
    const r = baseDatos.reservaciones.find((x) => x.idReservacion === 3)!
    r.fechaHora = hoyA(9)
    const editada = await resolver(hostess.actualizarReservacion(3, { personas: 5, fechaHora: hoyA(9) }))
    expect(editada.personas).toBe(5)
  })

  it('personas fuera de rango, estado final y mezcla de estado con edición se rechazan', async () => {
    const { hostess } = await nuevoMock()
    expect(await codigoDeError(hostess.actualizarReservacion(3, { personas: 25 }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.actualizarReservacion(4, { personas: 2 }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.actualizarReservacion(5, { personas: 2 }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.actualizarReservacion(3, { estado: 'confirmada', personas: 2 }))).toBe('estado_invalido')
  })
})

describe('mock reservaciones: registrar llegada', () => {
  it('con mesa: la reservación pasa a llegó con llegada_en y la mesa a ocupada', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.registrarLlegada(1, null))
    expect(r.mesa).toMatchObject({ idMesa: 7, estado: 'ocupada' })
    expect(r.reservacion).toMatchObject({ idReservacion: 1, estado: 'llego', idMesa: 7 })
    expect(r.reservacion?.llegadaEn).toBeInstanceOf(Date)
    expect(baseDatos.mesas.find((m) => m.idMesa === 7)?.estado).toBe('ocupada')
  })

  it('sin mesa hay que elegirla: sin ella se rechaza y no cambia nada', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.registrarLlegada(3, null))).toBe('estado_invalido')
    expect(baseDatos.reservaciones.find((r) => r.idReservacion === 3)?.estado).toBe('pendiente')
  })

  it('sin mesa y con una mesa libre elegida: queda ligada a esa mesa', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.registrarLlegada(3, 4))
    expect(r.reservacion).toMatchObject({ estado: 'llego', idMesa: 4, mesaNumero: 4 })
    expect(baseDatos.mesas.find((m) => m.idMesa === 4)?.estado).toBe('ocupada')
  })

  it('en otra mesa distinta de la reservada: la reservada se libera y la elegida se ocupa', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.registrarLlegada(1, 4))
    expect(r.reservacion?.idMesa).toBe(4)
    expect(baseDatos.mesas.find((m) => m.idMesa === 4)?.estado).toBe('ocupada')
    expect(baseDatos.mesas.find((m) => m.idMesa === 7)?.estado).toBe('libre')
  })

  it('si la mesa ya está ocupada se rechaza (mesa_no_disponible) y no cambia nada', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.registrarLlegada(3, 3))).toBe('mesa_no_disponible')
    expect(baseDatos.reservaciones.find((r) => r.idReservacion === 3)?.estado).toBe('pendiente')
    expect(baseDatos.reservaciones.find((r) => r.idReservacion === 3)?.idMesa).toBeNull()
  })

  it('una reservación que ya llegó o está cancelada no registra llegada', async () => {
    const { hostess } = await nuevoMock()
    expect(await codigoDeError(hostess.registrarLlegada(4, null))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.registrarLlegada(5, 4))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.registrarLlegada(99, 4))).toBe('no_encontrado')
  })

  it('con la misma Idempotency-Key el reintento no falla ni duplica', async () => {
    const { hostess } = await nuevoMock()
    const a = await resolver(hostess.registrarLlegada(3, 4, 'l-1'))
    const b = await resolver(hostess.registrarLlegada(3, 4, 'l-1'))
    expect(b).toEqual(a)
  })

  it('coherencia con el Salón: tras la llegada la reservación ya no aparece como próxima y la mesa está ocupada', async () => {
    const { hostess } = await nuevoMock()
    await resolver(hostess.registrarLlegada(1, null))
    const [mesas, reservaciones] = await Promise.all([resolver(hostess.listarMesas()), resolver(hostess.listarReservaciones())])
    expect(mesas.find((m) => m.idMesa === 7)?.estado).toBe('ocupada')
    expect(reservaciones.find((r) => r.idReservacion === 1)?.estado).toBe('llego')
  })
})
