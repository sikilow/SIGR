// Reglas del mock de hostess para la lista de espera (H3). Reloj fijo: viernes 16 de octubre de 2026, 12:00.
// Mesas: libres 1, 2, 4, 6 y 9; ocupadas 3, 5, 8, 11 y 12; reservadas 7 y 10.
// Lista de espera: #1 Héctor Salas (cliente 6, 3 personas, hace 25 min), #2 Valeria Núñez (cliente 7, 2 personas, hace 10 min),
// #3 Elena Castillo (cliente 5, 4 personas, asignada, hace 120 min).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const AHORA = new Date(2026, 9, 16, 12, 0, 0)

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

describe('mock espera: lectura', () => {
  it('sin argumento trae solo a quienes esperan, y por estado o «todas» trae los demás', async () => {
    const { hostess } = await nuevoMock()
    const ids = async (estado?: 'esperando' | 'asignada' | 'cancelada' | 'todas') =>
      (await resolver(hostess.listarEspera(estado))).map((e) => e.idEspera).sort()
    expect(await ids()).toEqual([1, 2])
    expect(await ids('esperando')).toEqual([1, 2])
    expect(await ids('asignada')).toEqual([3])
    expect(await ids('cancelada')).toEqual([])
    expect(await ids('todas')).toEqual([1, 2, 3])
  })

  it('«todas» no trae a los de otros días que ya no esperan, pero sí a quien sigue esperando', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const ayer = new Date(2026, 9, 15, 22, 0)
    baseDatos.listaEspera.push(
      { idEspera: 4, idCliente: 1, personas: 2, registradoEn: ayer, estado: 'cancelada' },
      { idEspera: 5, idCliente: 2, personas: 2, registradoEn: ayer, estado: 'esperando' },
    )
    const ids = (await resolver(hostess.listarEspera('todas'))).map((e) => e.idEspera).sort()
    expect(ids).toEqual([1, 2, 3, 5])
  })

  it('trae el nombre y el teléfono del cliente', async () => {
    const { hostess } = await nuevoMock()
    const primero = (await resolver(hostess.listarEspera())).find((e) => e.idEspera === 1)!
    expect(primero).toMatchObject({ clienteNombre: 'Héctor Salas', clienteTelefono: '3115550206', personas: 3 })
  })
})

describe('mock espera: agregar', () => {
  it('crea un grupo que espera, con la hora de ahora, y aparece en la lista', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const e = await resolver(hostess.crearEspera({ idCliente: 1, personas: 4 }))
    expect(e).toMatchObject({ idEspera: 4, idCliente: 1, personas: 4, estado: 'esperando', clienteNombre: 'Carlos Medina' })
    // El reloj falso avanzó los 300 ms de «red»: el registro es de «ahora».
    expect(Math.abs(e.registradoEn.getTime() - AHORA.getTime())).toBeLessThan(2000)
    expect(baseDatos.listaEspera).toHaveLength(4)
    expect((await resolver(hostess.listarEspera())).map((x) => x.idEspera)).toContain(4)
  })

  it('rechaza personas fuera de 1 a 20, cliente inexistente y cliente que ya espera', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    expect(await codigoDeError(hostess.crearEspera({ idCliente: 1, personas: 0 }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.crearEspera({ idCliente: 1, personas: 21 }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.crearEspera({ idCliente: 99, personas: 2 }))).toBe('no_encontrado')
    expect(await codigoDeError(hostess.crearEspera({ idCliente: 6, personas: 2 }))).toBe('estado_invalido')
    expect(baseDatos.listaEspera).toHaveLength(3)
  })

  it('un cliente cuya espera ya terminó se puede volver a anotar', async () => {
    const { hostess } = await nuevoMock()
    // Elena (cliente 5) tiene una espera asignada, no activa.
    const e = await resolver(hostess.crearEspera({ idCliente: 5, personas: 2 }))
    expect(e.estado).toBe('esperando')
  })

  it('con la misma Idempotency-Key no duplica el grupo', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const a = await resolver(hostess.crearEspera({ idCliente: 1, personas: 4 }, 'e-1'))
    const b = await resolver(hostess.crearEspera({ idCliente: 1, personas: 4 }, 'e-1'))
    expect(b).toEqual(a)
    expect(baseDatos.listaEspera).toHaveLength(4)
  })
})

describe('mock espera: quitar de la lista', () => {
  it('pasa a cancelada, nunca se borra la fila y sale de la lista de quienes esperan', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const e = await resolver(hostess.actualizarEspera(1, { estado: 'cancelada' }))
    expect(e).toMatchObject({ idEspera: 1, estado: 'cancelada' })
    expect(baseDatos.listaEspera).toHaveLength(3)
    expect(baseDatos.listaEspera.find((x) => x.idEspera === 1)?.estado).toBe('cancelada')
    expect((await resolver(hostess.listarEspera())).map((x) => x.idEspera)).toEqual([2])
    expect((await resolver(hostess.listarEspera('cancelada'))).map((x) => x.idEspera)).toEqual([1])
  })

  it('no toca ninguna mesa', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const mesasAntes = structuredClone(baseDatos.mesas)
    await resolver(hostess.actualizarEspera(2, { estado: 'cancelada' }))
    expect(baseDatos.mesas).toEqual(mesasAntes)
  })

  it('quien ya fue asignado o ya se quitó no se puede quitar de nuevo; uno que no existe da no_encontrado', async () => {
    const { hostess } = await nuevoMock()
    expect(await codigoDeError(hostess.actualizarEspera(3, { estado: 'cancelada' }))).toBe('estado_invalido')
    await resolver(hostess.actualizarEspera(1, { estado: 'cancelada' }))
    expect(await codigoDeError(hostess.actualizarEspera(1, { estado: 'cancelada' }))).toBe('estado_invalido')
    expect(await codigoDeError(hostess.actualizarEspera(99, { estado: 'cancelada' }))).toBe('no_encontrado')
  })

  it('cualquier otro estado se rechaza', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const mal = { estado: 'asignada' } as unknown as { estado: 'cancelada' }
    expect(await codigoDeError(hostess.actualizarEspera(1, mal))).toBe('estado_invalido')
    expect(baseDatos.listaEspera.find((x) => x.idEspera === 1)?.estado).toBe('esperando')
  })

  it('con la misma Idempotency-Key el reintento devuelve lo mismo y no falla', async () => {
    const { hostess } = await nuevoMock()
    const a = await resolver(hostess.actualizarEspera(1, { estado: 'cancelada' }, 'q-1'))
    const b = await resolver(hostess.actualizarEspera(1, { estado: 'cancelada' }, 'q-1'))
    expect(b).toEqual(a)
  })
})

describe('mock espera: asignar mesa (POST /mesas/{id}/asignar)', () => {
  it('la mesa pasa a ocupada y el grupo a asignada; el grupo sale de la lista de quienes esperan', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    const r = await resolver(hostess.asignarMesa(4, { tipo: 'espera', idEspera: 1 }))
    expect(r.mesa).toMatchObject({ idMesa: 4, estado: 'ocupada' })
    expect(r.espera).toMatchObject({ idEspera: 1, estado: 'asignada' })
    expect(baseDatos.mesas.find((m) => m.idMesa === 4)?.estado).toBe('ocupada')
    expect((await resolver(hostess.listarEspera())).map((x) => x.idEspera)).toEqual([2])
    expect((await resolver(hostess.listarEspera('asignada'))).map((x) => x.idEspera).sort()).toEqual([1, 3])
  })

  it('un grupo que se fue (cancelada) ya no se puede sentar', async () => {
    const { hostess, baseDatos } = await nuevoMock()
    await resolver(hostess.actualizarEspera(1, { estado: 'cancelada' }))
    expect(await codigoDeError(hostess.asignarMesa(4, { tipo: 'espera', idEspera: 1 }))).toBe('estado_invalido')
    expect(baseDatos.mesas.find((m) => m.idMesa === 4)?.estado).toBe('libre')
  })

  it('coherencia con el Salón: tras agregar y sentar a un grupo, la mesa está ocupada y el grupo ya no espera', async () => {
    const { hostess } = await nuevoMock()
    const nuevo = await resolver(hostess.crearEspera({ idCliente: 1, personas: 4 }))
    await resolver(hostess.asignarMesa(2, { tipo: 'espera', idEspera: nuevo.idEspera }))
    const [mesas, espera] = await Promise.all([resolver(hostess.listarMesas()), resolver(hostess.listarEspera())])
    expect(mesas.find((m) => m.idMesa === 2)?.estado).toBe('ocupada')
    expect(espera.map((x) => x.idEspera)).not.toContain(nuevo.idEspera)
  })
})
