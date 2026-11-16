// Una reservación solo se registra o se confirma si hay una mesa para el grupo a esa hora (mock de hostess).
// Reloj fijo: viernes 16 de octubre de 2026, 12:00. Mesas de 8 personas: la 8 y la 18.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const AHORA = new Date(2026, 9, 16, 12, 0, 0)
const manana = (hora: number) => new Date(2026, 9, 17, hora, 0)

async function nuevoMock() {
  vi.resetModules()
  const { crearHostessMock } = await import('./mock')
  return crearHostessMock()
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

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(AHORA)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mesas disponibles al registrar y al confirmar una reservación (mock)', () => {
  it('rechaza un grupo para el que no existe ninguna mesa', async () => {
    const hostess = await nuevoMock()
    const e = await errorDe(hostess.crearReservacion({ idCliente: 6, fechaHora: manana(14), personas: 12, idMesa: null }))
    expect(e.codigo).toBe('mesa_no_disponible')
    expect(e.mensaje).toContain('No tenemos mesas para 12 personas')
  })

  it('al confirmar se comprueba que todavía quede una mesa: con las dos de 8 comprometidas, la tercera no se confirma', async () => {
    const hostess = await nuevoMock()
    const solicitudes = []
    for (const idCliente of [1, 4, 6]) {
      solicitudes.push(await resolver(hostess.crearReservacion({ idCliente, fechaHora: manana(14), personas: 8, idMesa: null })))
    }
    expect(solicitudes.map((r) => r.estado)).toEqual(['pendiente', 'pendiente', 'pendiente'])

    // Una solicitud pendiente todavía no compromete mesa: se pueden confirmar dos (las dos mesas de 8)...
    await resolver(hostess.actualizarReservacion(solicitudes[0]!.idReservacion, { estado: 'confirmada' }))
    await resolver(hostess.actualizarReservacion(solicitudes[1]!.idReservacion, { estado: 'confirmada' }))
    // ...y la tercera, a la misma hora, ya no.
    const e = await errorDe(hostess.actualizarReservacion(solicitudes[2]!.idReservacion, { estado: 'confirmada' }))
    expect(e.codigo).toBe('mesa_no_disponible')
    expect(e.mensaje).toContain('Elige otro horario')
  })

  it('en otro horario (a más de 1 h 30 min) sí hay mesa', async () => {
    const hostess = await nuevoMock()
    const a = await resolver(hostess.crearReservacion({ idCliente: 1, fechaHora: manana(14), personas: 8, idMesa: null }))
    const b = await resolver(hostess.crearReservacion({ idCliente: 4, fechaHora: manana(14), personas: 8, idMesa: null }))
    const c = await resolver(hostess.crearReservacion({ idCliente: 6, fechaHora: manana(18), personas: 8, idMesa: null }))
    await resolver(hostess.actualizarReservacion(a.idReservacion, { estado: 'confirmada' }))
    await resolver(hostess.actualizarReservacion(b.idReservacion, { estado: 'confirmada' }))
    expect((await resolver(hostess.actualizarReservacion(c.idReservacion, { estado: 'confirmada' }))).estado).toBe('confirmada')
  })
})
