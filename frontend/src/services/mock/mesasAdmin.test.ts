// Administración de mesas del gerente (mock). Cada prueba parte de una «base de datos» recién creada.
// Mesas de la demo: libres 1, 2, 4, 6 y 9; ocupadas 3, 5, 8, 11 y 12; reservadas 7 y 10. La mesa 2 solo tiene una cuenta cerrada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function nuevoMock() {
  vi.resetModules()
  const [{ crearCatalogoMock }, { crearMesasMock }, { crearHostessMock }] = await Promise.all([
    import('./adminMock'),
    import('./mesasMock'),
    import('../hostess/mock'),
  ])
  return { catalogo: crearCatalogoMock(), mesas: crearMesasMock(), hostess: crearHostessMock() }
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

async function errorDe(promesa: Promise<unknown>): Promise<{ codigo: string; mensaje: string }> {
  try {
    await resolver(promesa)
  } catch (e) {
    // Se lee sin `instanceof`: tras resetModules la clase ErrorServicio es otra instancia.
    const err = e as { codigo?: string; message?: string }
    if (err.codigo) return { codigo: err.codigo, mensaje: err.message ?? '' }
    throw e
  }
  throw new Error('Se esperaba un error y no hubo ninguno')
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('registrar mesas', () => {
  it('crea una mesa libre con su sección y aparece para el gerente, el mesero y la hostess', async () => {
    const { catalogo, mesas, hostess } = await nuevoMock()
    const nueva = await resolver(catalogo.crearMesa({ numero: 100, capacidad: 4, zona: ' Terraza ', activa: true }))
    expect(nueva).toMatchObject({ numero: 100, capacidad: 4, zona: 'Terraza', activa: true, estado: 'libre' })

    expect((await resolver(catalogo.listarMesas())).map((m) => m.numero)).toContain(100)
    expect((await resolver(mesas.listar())).map((m) => m.numero)).toContain(100)
    expect((await resolver(hostess.listarMesas())).map((m) => m.numero)).toContain(100)
  })

  it('no permite crear una mesa sin sección', async () => {
    const { catalogo } = await nuevoMock()
    const e = await errorDe(catalogo.crearMesa({ numero: 20, capacidad: 2, zona: '   ', activa: true }))
    expect(e.codigo).toBe('estado_invalido')
    expect(e.mensaje).toContain('sección')
  })

  it('no permite repetir el número de una mesa', async () => {
    const { catalogo } = await nuevoMock()
    const e = await errorDe(catalogo.crearMesa({ numero: 3, capacidad: 2, zona: 'Salón', activa: true }))
    expect(e.codigo).toBe('estado_invalido')
    expect(e.mensaje).toContain('Ya existe la mesa 3')
  })

  it.each([
    ['número 0', { numero: 0, capacidad: 2, zona: '' }],
    ['número mayor a 999', { numero: 1000, capacidad: 2, zona: '' }],
    ['capacidad 0', { numero: 30, capacidad: 0, zona: '' }],
    ['capacidad mayor a 50', { numero: 30, capacidad: 51, zona: '' }],
    ['capacidad con decimales', { numero: 30, capacidad: 2.5, zona: '' }],
    ['sección de más de 40 caracteres', { numero: 30, capacidad: 2, zona: 'x'.repeat(41) }],
  ])('rechaza %s', async (_nombre, datos) => {
    const { catalogo } = await nuevoMock()
    expect((await errorDe(catalogo.crearMesa({ ...datos, activa: true }))).codigo).toBe('estado_invalido')
  })
})

describe('mesas no disponibles', () => {
  it('una mesa creada como no disponible no aparece para la hostess ni para el mesero, pero sí para el gerente', async () => {
    const { catalogo, mesas, hostess } = await nuevoMock()
    await resolver(catalogo.crearMesa({ numero: 101, capacidad: 6, zona: 'Barra', activa: false }))

    expect((await resolver(mesas.listar())).map((m) => m.numero)).not.toContain(101)
    expect((await resolver(hostess.listarMesas())).map((m) => m.numero)).not.toContain(101)
    const delGerente = await resolver(catalogo.listarMesas())
    expect(delGerente.find((m) => m.numero === 101)).toMatchObject({ activa: false, zona: 'Barra' })
  })

  it('al desactivar una mesa libre desaparece del panel y del salón, y al reactivarla vuelve', async () => {
    const { catalogo, mesas, hostess } = await nuevoMock()
    const mesa1 = (await resolver(catalogo.listarMesas())).find((m) => m.numero === 1)!

    await resolver(catalogo.actualizarMesa(mesa1.idMesa, { activa: false }))
    expect((await resolver(mesas.listar())).map((m) => m.numero)).not.toContain(1)
    expect((await resolver(hostess.listarMesas())).map((m) => m.numero)).not.toContain(1)

    await resolver(catalogo.actualizarMesa(mesa1.idMesa, { activa: true }))
    expect((await resolver(mesas.listar())).map((m) => m.numero)).toContain(1)
    expect((await resolver(hostess.listarMesas())).map((m) => m.numero)).toContain(1)
  })

  it('no se puede sentar a nadie en una mesa no disponible', async () => {
    const { catalogo, hostess } = await nuevoMock()
    const mesa1 = (await resolver(catalogo.listarMesas())).find((m) => m.numero === 1)!
    await resolver(catalogo.actualizarMesa(mesa1.idMesa, { activa: false }))
    expect((await errorDe(hostess.asignarMesa(mesa1.idMesa, { tipo: 'sinRegistro', personas: 2 }))).codigo).toBe('mesa_no_disponible')
  })

  it('no se puede reservar una mesa no disponible', async () => {
    const { catalogo, hostess } = await nuevoMock()
    const mesa1 = (await resolver(catalogo.listarMesas())).find((m) => m.numero === 1)!
    await resolver(catalogo.actualizarMesa(mesa1.idMesa, { activa: false }))
    const e = await errorDe(hostess.crearReservacion({ idCliente: 1, fechaHora: new Date(Date.now() + 60_000), personas: 2, idMesa: mesa1.idMesa }))
    expect(e.codigo).toBe('mesa_no_disponible')
  })

  it.each([
    ['ocupada', 3],
    ['reservada', 7],
  ])('no se puede marcar como no disponible una mesa %s', async (estado, numero) => {
    const { catalogo } = await nuevoMock()
    const mesa = (await resolver(catalogo.listarMesas())).find((m) => m.numero === numero)!
    const e = await errorDe(catalogo.actualizarMesa(mesa.idMesa, { activa: false }))
    expect(e.codigo).toBe('estado_invalido')
    expect(e.mensaje).toContain(estado)
  })

  it('una mesa libre que solo tuvo una cuenta ya cerrada sí se puede desactivar', async () => {
    const { catalogo } = await nuevoMock()
    const mesa2 = (await resolver(catalogo.listarMesas())).find((m) => m.numero === 2)!
    const r = await resolver(catalogo.actualizarMesa(mesa2.idMesa, { activa: false }))
    expect(r.activa).toBe(false)
  })
})

describe('editar mesas', () => {
  it('cambia capacidad, sección y número', async () => {
    const { catalogo } = await nuevoMock()
    const mesa4 = (await resolver(catalogo.listarMesas())).find((m) => m.numero === 4)!
    await resolver(catalogo.crearSeccion('Salón principal'))
    const r = await resolver(catalogo.actualizarMesa(mesa4.idMesa, { capacidad: 8, zona: 'Salón principal', numero: 40 }))
    expect(r).toMatchObject({ numero: 40, capacidad: 8, zona: 'Salón principal' })
  })

  it('no permite quitar la sección obligatoria', async () => {
    const { catalogo } = await nuevoMock()
    const mesa4 = (await resolver(catalogo.listarMesas())).find((m) => m.numero === 4)!
    expect((await errorDe(catalogo.actualizarMesa(mesa4.idMesa, { zona: '' }))).codigo).toBe('estado_invalido')
  })

  it('no permite renumerar a un número que ya existe', async () => {
    const { catalogo } = await nuevoMock()
    const mesa4 = (await resolver(catalogo.listarMesas())).find((m) => m.numero === 4)!
    expect((await errorDe(catalogo.actualizarMesa(mesa4.idMesa, { numero: 3 }))).codigo).toBe('estado_invalido')
  })

  it('una mesa que no existe devuelve no_encontrado y un cambio vacío es inválido', async () => {
    const { catalogo } = await nuevoMock()
    expect((await errorDe(catalogo.actualizarMesa(9999, { zona: 'X' }))).codigo).toBe('no_encontrado')
    const mesa4 = (await resolver(catalogo.listarMesas())).find((m) => m.numero === 4)!
    expect((await errorDe(catalogo.actualizarMesa(mesa4.idMesa, {}))).codigo).toBe('estado_invalido')
  })

  it('la lista del gerente viene ordenada por número', async () => {
    const { catalogo } = await nuevoMock()
    await resolver(catalogo.crearMesa({ numero: 102, capacidad: 2, zona: 'General', activa: true }))
    const numeros = (await resolver(catalogo.listarMesas())).map((m) => m.numero)
    expect(numeros).toEqual([...numeros].sort((a, b) => a - b))
  })
})

describe('administración de secciones', () => {
  it('crea y renombra una sección, actualizando también las mesas asignadas', async () => {
    const { catalogo } = await nuevoMock()
    const nueva = await resolver(catalogo.crearSeccion('Patio'))
    expect(nueva).toMatchObject({ nombre: 'Patio', activa: true, totalMesas: 0 })
    const mesa = await resolver(catalogo.crearMesa({ numero: 120, capacidad: 4, zona: 'Patio', activa: true }))

    const renombrada = await resolver(catalogo.renombrarSeccion('Patio', 'Patio norte'))
    expect(renombrada).toMatchObject({ nombre: 'Patio norte', totalMesas: 1 })
    expect((await resolver(catalogo.listarMesas())).find((m) => m.idMesa === mesa.idMesa)?.zona).toBe('Patio norte')
  })

  it('inhabilita las mesas de una sección para mesero y hostess, y las restaura al habilitarla', async () => {
    const { catalogo, mesas, hostess } = await nuevoMock()
    await resolver(catalogo.actualizarSeccion('General', { activa: false }))
    expect((await resolver(mesas.listar())).map((m) => m.numero)).not.toContain(18)
    expect((await resolver(hostess.listarMesas())).map((m) => m.numero)).not.toContain(18)

    await resolver(catalogo.actualizarSeccion('General', { activa: true }))
    expect((await resolver(mesas.listar())).map((m) => m.numero)).toContain(18)
    expect((await resolver(hostess.listarMesas())).map((m) => m.numero)).toContain(18)
  })

  it('no permite inhabilitar secciones con mesas en uso, borrar secciones asignadas ni asignar una inhabilitada', async () => {
    const { catalogo, hostess } = await nuevoMock()
    expect((await errorDe(catalogo.actualizarSeccion('Salón', { activa: false }))).codigo).toBe('estado_invalido')
    expect((await errorDe(catalogo.eliminarSeccion('General'))).codigo).toBe('estado_invalido')
    await resolver(catalogo.actualizarSeccion('General', { activa: false }))
    expect((await errorDe(catalogo.crearMesa({ numero: 121, capacidad: 2, zona: 'General', activa: true }))).codigo).toBe('estado_invalido')
    expect((await errorDe(hostess.asignarMesa(18, { tipo: 'sinRegistro', personas: 2 }))).codigo).toBe('mesa_no_disponible')
  })

  it('permite borrar solo una sección vacía', async () => {
    const { catalogo } = await nuevoMock()
    await resolver(catalogo.crearSeccion('Evento'))
    await resolver(catalogo.eliminarSeccion('Evento'))
    expect((await resolver(catalogo.listarSecciones())).some((s) => s.nombre === 'Evento')).toBe(false)
  })
})
