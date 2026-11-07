// Reglas del mock de hostess. Cada prueba parte de una «base de datos» recién creada (se reimportan los
// módulos) y usa temporizadores falsos para no esperar el retraso de red.
// Mesas del mock: libres 1, 2, 4, 6 y 9; ocupadas 3, 5, 8, 11 y 12; reservadas 7 (reservación 1) y 10 (reservación 2).
// Reservaciones: #1 confirmada (mesa 7), #2 confirmada (mesa 10), #3 pendiente sin mesa, #4 llegó (mesa 8), #5 cancelada (ayer).
// Lista de espera: #1 y #2 esperando, #3 asignada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function nuevoMock() {
  vi.resetModules()
  const [{ crearHostessMock }, { crearMesasMock }, { baseDatos }] = await Promise.all([
    import('./mock'),
    import('../mock/mesasMock'),
    import('../mock/baseDatos'),
  ])
  return { hostess: crearHostessMock(), mesasMesero: crearMesasMock(), baseDatos }
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

describe('mock hostess: lecturas', () => {
  it('lista las 18 mesas con solo las columnas de mesa (sin pedidos ni cuenta)', async () => {
    const { hostess } = await nuevoMock()
    const mesas = await resolver(hostess.listarMesas())
    expect(mesas).toHaveLength(18)
    expect(mesas.filter((mesa) => mesa.numero >= 13)).toEqual([
      expect.objectContaining({ idMesa: 13, numero: 13, capacidad: 2, estado: 'libre' }),
      expect.objectContaining({ idMesa: 14, numero: 14, capacidad: 2, estado: 'libre' }),
      expect.objectContaining({ idMesa: 15, numero: 15, capacidad: 4, estado: 'libre' }),
      expect.objectContaining({ idMesa: 16, numero: 16, capacidad: 4, estado: 'libre' }),
      expect.objectContaining({ idMesa: 17, numero: 17, capacidad: 6, estado: 'libre' }),
      expect.objectContaining({ idMesa: 18, numero: 18, capacidad: 8, estado: 'libre' }),
    ])
    for (const m of mesas) {
      expect(Object.keys(m).sort()).toEqual([
        'capacidad', 'espacioCarriola', 'estado', 'idMesa', 'numero', 'plantaBaja', 'sinEscaleras', 'zona',
      ])
    }
    // Secciones de ejemplo del mock (RF-MES-007): Salón 1–8, Terraza 9–14, Barra 15–17 y General 18
    expect(mesas.filter((m) => m.zona === 'Terraza').map((m) => m.numero)).toEqual([9, 10, 11, 12, 13, 14])
    expect(mesas.filter((m) => m.zona === 'Barra').map((m) => m.numero)).toEqual([15, 16, 17])
    expect(mesas.find((m) => m.numero === 18)?.zona).toBe('General')
    expect(mesas.filter((m) => m.estado === 'libre').map((m) => m.numero)).toEqual([1, 2, 4, 6, 9, 13, 14, 15, 16, 17, 18])
    expect(mesas.filter((m) => m.estado === 'ocupada').map((m) => m.numero)).toEqual([3, 5, 8, 11, 12])
    expect(mesas.filter((m) => m.estado === 'reservada').map((m) => m.numero)).toEqual([7, 10])
  })

  it('las reservaciones del día traen cliente y mesa; la de ayer no aparece', async () => {
    const { hostess } = await nuevoMock()
    const reservaciones = await resolver(hostess.listarReservaciones())
    expect(reservaciones.map((r) => r.idReservacion).sort()).toEqual([1, 2, 3, 4])
    const primera = reservaciones.find((r) => r.idReservacion === 1)!
    expect(primera).toMatchObject({ clienteNombre: 'Carlos Medina', mesaNumero: 7, estado: 'confirmada' })
    expect(reservaciones.find((r) => r.idReservacion === 3)).toMatchObject({ idMesa: null, mesaNumero: null, estado: 'pendiente' })
  })

  it('la lista de espera solo trae a quienes siguen esperando', async () => {
    const { hostess } = await nuevoMock()
    const espera = await resolver(hostess.listarEspera())
    expect(espera.map((e) => e.idEspera).sort()).toEqual([1, 2])
    expect(espera.every((e) => e.estado === 'esperando')).toBe(true)
  })
})

describe('mock hostess: asignar mesa', () => {
  it('a una reservación: la mesa pasa a ocupada, la reservación a «llego» y se llena llegada_en', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.asignarMesa(7, { tipo: 'reservacion', idReservacion: 1 }))
    expect(r.mesa).toMatchObject({ idMesa: 7, estado: 'ocupada' })
    expect(r.reservacion).toMatchObject({ idReservacion: 1, estado: 'llego', mesaNumero: 7 })
    expect(r.reservacion?.llegadaEn).toBeInstanceOf(Date)
    expect(r.espera).toBeNull()
    expect(baseDatos.mesas.find((m) => m.idMesa === 7)?.estado).toBe('ocupada')
    const guardada = baseDatos.reservaciones.find((x) => x.idReservacion === 1)!
    expect(guardada.estado).toBe('llego')
    expect(guardada.llegadaEn).toBeInstanceOf(Date)
  })

  it('una reservación sin mesa en una mesa libre: queda ligada a esa mesa', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.asignarMesa(9, { tipo: 'reservacion', idReservacion: 3 }))
    expect(r.reservacion).toMatchObject({ idMesa: 9, mesaNumero: 9, estado: 'llego' })
    expect(baseDatos.mesas.find((m) => m.idMesa === 9)?.estado).toBe('ocupada')
  })

  it('a un grupo en espera: la mesa pasa a ocupada y el grupo a «asignada»', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.asignarMesa(4, { tipo: 'espera', idEspera: 1 }))
    expect(r.mesa).toMatchObject({ idMesa: 4, estado: 'ocupada' })
    expect(r.espera).toMatchObject({ idEspera: 1, estado: 'asignada' })
    expect(r.reservacion).toBeNull()
    expect(baseDatos.listaEspera.find((e) => e.idEspera === 1)?.estado).toBe('asignada')
    // y ya no aparece entre los que esperan
    expect((await resolver(hostess.listarEspera())).map((e) => e.idEspera)).toEqual([2])
  })

  it('a un grupo sin registro: solo cambia la mesa', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const reservacionesAntes = structuredClone(baseDatos.reservaciones)
    const esperaAntes = structuredClone(baseDatos.listaEspera)
    const r = await resolver(hostess.asignarMesa(1, { tipo: 'sinRegistro', personas: 6 }))
    expect(r.mesa).toMatchObject({ idMesa: 1, estado: 'ocupada' })
    expect(r.reservacion).toBeNull()
    expect(r.espera).toBeNull()
    expect(baseDatos.reservaciones).toEqual(reservacionesAntes)
    expect(baseDatos.listaEspera).toEqual(esperaAntes)
  })

  it('la mesa asignada se ve ocupada en el Panel de mesas del mesero (estado compartido)', async () => {
    const { hostess, mesasMesero } = await nuevoMock()
    await resolver(hostess.asignarMesa(1, { tipo: 'sinRegistro', personas: 2 }))
    const mesas = await resolver(mesasMesero.listar())
    expect(mesas.find((m) => m.idMesa === 1)?.estado).toBe('ocupada')
  })

  it('una mesa ocupada no se asigna (mesa_no_disponible) y no cambia nada', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.asignarMesa(3, { tipo: 'espera', idEspera: 1 }))).toBe('mesa_no_disponible')
    expect(baseDatos.listaEspera.find((e) => e.idEspera === 1)?.estado).toBe('esperando')
  })

  it('una mesa que no existe da no_encontrado', async () => {
    const { hostess } = await nuevoMock()
    expect(await codigoDeError(hostess.asignarMesa(99, { tipo: 'sinRegistro', personas: 2 }))).toBe('no_encontrado')
  })

  it.each([
    [4, 'llego'],
    [5, 'cancelada'],
  ])('la reservación #%i (%s) no se puede asignar: estado_invalido y la mesa queda libre', async (idReservacion) => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.asignarMesa(1, { tipo: 'reservacion', idReservacion }))).toBe('estado_invalido')
    expect(baseDatos.mesas.find((m) => m.idMesa === 1)?.estado).toBe('libre')
  })

  it('una reservación que ya tiene OTRA mesa no se puede sentar en esta', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.asignarMesa(1, { tipo: 'reservacion', idReservacion: 1 }))).toBe('estado_invalido')
    expect(baseDatos.reservaciones.find((r) => r.idReservacion === 1)?.estado).toBe('confirmada')
  })

  it('un grupo que ya fue asignado no se vuelve a asignar', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.asignarMesa(1, { tipo: 'espera', idEspera: 3 }))).toBe('estado_invalido')
    expect(baseDatos.mesas.find((m) => m.idMesa === 1)?.estado).toBe('libre')
  })

  it('un grupo sin registro con personas inválidas se rechaza y no cambia la mesa', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.asignarMesa(1, { tipo: 'sinRegistro', personas: 0 }))).toBe('estado_invalido')
    expect(baseDatos.mesas.find((m) => m.idMesa === 1)?.estado).toBe('libre')
  })

  it('con la misma Idempotency-Key el reintento devuelve lo mismo y no falla (la mesa ya estaba ocupada)', async () => {
    const { hostess } = await nuevoMock()
    const primera = await resolver(hostess.asignarMesa(1, { tipo: 'sinRegistro', personas: 2 }, 'clave-1'))
    const repetida = await resolver(hostess.asignarMesa(1, { tipo: 'sinRegistro', personas: 2 }, 'clave-1'))
    expect(repetida).toEqual(primera)
  })

  it('sin la clave, repetir la asignación a una mesa ya ocupada se rechaza', async () => {
    const { hostess } = await nuevoMock()
    await resolver(hostess.asignarMesa(1, { tipo: 'sinRegistro', personas: 2 }))
    expect(await codigoDeError(hostess.asignarMesa(1, { tipo: 'sinRegistro', personas: 2 }))).toBe('mesa_no_disponible')
  })

  it('si se pierde la respuesta, el reintento con la misma clave no duplica la asignación', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    // El entorno de pruebas no tiene sessionStorage: se simula uno con el fallo «perderRespuesta» pendiente 1 vez.
    const almacen = new Map([['sigr.mock.perderRespuesta', '1']])
    vi.stubGlobal('sessionStorage', {
      getItem: (clave: string) => almacen.get(clave) ?? null,
      setItem: (clave: string, valor: string) => void almacen.set(clave, valor),
      removeItem: (clave: string) => void almacen.delete(clave),
    })
    try {
      expect(await codigoDeError(hostess.asignarMesa(2, { tipo: 'espera', idEspera: 2 }, 'clave-2'))).toBe('red')
      // La acción SÍ se aplicó aunque la respuesta no llegó…
      expect(baseDatos.mesas.find((m) => m.idMesa === 2)?.estado).toBe('ocupada')
      // …y el reintento con la misma clave devuelve el resultado en vez de fallar con mesa_no_disponible.
      const r = await resolver(hostess.asignarMesa(2, { tipo: 'espera', idEspera: 2 }, 'clave-2'))
      expect(r.espera?.estado).toBe('asignada')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
