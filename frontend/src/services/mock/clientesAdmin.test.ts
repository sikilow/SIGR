import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Gestión de clientes por el gerente en la demo (migración 028): editar, eliminar (lógico) y restaurar.

async function nuevo() {
  vi.resetModules()
  const [{ crearClientesMock }, { crearHostessMock }, { baseDatos }] = await Promise.all([import('./adminMock'), import('../hostess/mock'), import('./baseDatos')])
  return { clientes: crearClientesMock(), hostess: crearHostessMock(), baseDatos }
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

/** Un cliente sin reservaciones vigentes ni en la lista de espera. */
function clienteLibre(baseDatos: Awaited<ReturnType<typeof nuevo>>['baseDatos']) {
  return baseDatos.clientes.find(
    (c) =>
      !baseDatos.reservaciones.some((r) => r.idCliente === c.idCliente && (r.estado === 'pendiente' || r.estado === 'confirmada')) &&
      !baseDatos.listaEspera.some((e) => e.idCliente === c.idCliente && e.estado === 'esperando'),
  )!
}

describe('mock: clientes del gerente', () => {
  it('lista con sus reservaciones, elimina, oculta de la búsqueda de la hostess y restaura', async () => {
    const { clientes, hostess, baseDatos } = await nuevo()
    const c = clienteLibre(baseDatos)

    const lista = await resolver(clientes.listar())
    expect(lista.find((x) => x.idCliente === c.idCliente)?.eliminadoEn).toBeNull()

    const eliminado = await resolver(clientes.eliminar(c.idCliente))
    expect(eliminado.eliminadoEn).toBeInstanceOf(Date)
    expect((await resolver(clientes.listar())).some((x) => x.idCliente === c.idCliente)).toBe(false)
    expect((await resolver(clientes.listar({ eliminados: true }))).map((x) => x.idCliente)).toEqual([c.idCliente])
    // La hostess ya no lo encuentra.
    expect((await resolver(hostess.buscarClientes(c.nombre.slice(0, 4)))).some((x) => x.idCliente === c.idCliente)).toBe(false)

    const restaurado = await resolver(clientes.restaurar(c.idCliente))
    expect(restaurado.eliminadoEn).toBeNull()
    expect((await resolver(hostess.buscarClientes(c.nombre.slice(0, 4)))).some((x) => x.idCliente === c.idCliente)).toBe(true)
  })

  it('no se elimina con reservación vigente, ni dos veces; no se edita ni restaura mal', async () => {
    const { clientes, baseDatos } = await nuevo()
    const conReserva = baseDatos.reservaciones.find((r) => r.estado === 'pendiente' || r.estado === 'confirmada')!
    expect(await mensajeDeError(clientes.eliminar(conReserva.idCliente))).toMatch(/reservaci/)

    const libre = clienteLibre(baseDatos)
    await resolver(clientes.eliminar(libre.idCliente))
    expect(await mensajeDeError(clientes.eliminar(libre.idCliente))).toMatch(/ya está eliminado/)
    expect(await mensajeDeError(clientes.actualizar(libre.idCliente, { nombre: 'Otro Nombre' }))).toMatch(/eliminado/)
    await resolver(clientes.restaurar(libre.idCliente))
    expect(await mensajeDeError(clientes.restaurar(libre.idCliente))).toMatch(/no está eliminado/)
  })

  it('corrige datos y valida el teléfono según la lada', async () => {
    const { clientes, baseDatos } = await nuevo()
    const c = clienteLibre(baseDatos)
    const r = await resolver(clientes.actualizar(c.idCliente, { nombre: 'Nombre Nuevo', lada: '34', telefono: '612345678' }))
    expect(r).toMatchObject({ nombre: 'Nombre Nuevo', lada: '34', telefono: '612345678' })
    expect(await mensajeDeError(clientes.actualizar(c.idCliente, { telefono: '6123456789' }))).toMatch(/9 dígitos/)
  })

  it('la hostess no puede crear uno con el teléfono de un cliente eliminado', async () => {
    const { clientes, hostess, baseDatos } = await nuevo()
    const c = clienteLibre(baseDatos)
    await resolver(clientes.eliminar(c.idCliente))
    const mensaje = await mensajeDeError(hostess.crearCliente({ nombre: 'Otra Persona', telefono: c.telefono!, correo: null }))
    expect(mensaje).toMatch(/eliminado/)
  })
})
