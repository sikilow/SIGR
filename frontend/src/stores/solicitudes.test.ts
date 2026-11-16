import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservacion } from '../types'

const { listarMock } = vi.hoisted(() => ({ listarMock: vi.fn() }))
vi.mock('../services', () => ({ servicios: { hostess: { listarReservacionesPendientes: listarMock } } }))

import { useSolicitudesStore } from './solicitudes'

function reservacion(id: number): Reservacion {
  return {
    idReservacion: id,
    idCliente: 1,
    idMesa: null,
    fechaHora: new Date(2026, 10, 16, 14, 0),
    personas: 2,
    estado: 'pendiente',
    llegadaEn: null,
    clienteNombre: `Cliente ${id}`,
    clienteTelefono: null,
    clienteCorreo: null,
  } as Reservacion
}

beforeEach(() => {
  setActivePinia(createPinia())
  listarMock.mockReset()
})

describe('alerta de solicitudes nuevas para la hostess', () => {
  it('la primera consulta solo toma nota de lo que ya había: la insignia lo cuenta, pero no hay alerta', async () => {
    listarMock.mockResolvedValue([reservacion(1), reservacion(2)])
    const tienda = useSolicitudesStore()
    await tienda.cargar()
    expect(tienda.pendientes).toHaveLength(2)
    expect(tienda.nuevas).toHaveLength(0)
  })

  it('avisa de una solicitud que llega después y deja de avisar al descartarla', async () => {
    listarMock.mockResolvedValueOnce([reservacion(1)])
    const tienda = useSolicitudesStore()
    await tienda.cargar()

    listarMock.mockResolvedValueOnce([reservacion(1), reservacion(2)])
    await tienda.cargar()
    expect(tienda.nuevas.map((r) => r.idReservacion)).toEqual([2])
    expect(tienda.pendientes).toHaveLength(2)

    tienda.descartar()
    expect(tienda.nuevas).toHaveLength(0)
    // Con la misma lista no se vuelve a avisar de la misma solicitud.
    listarMock.mockResolvedValueOnce([reservacion(1), reservacion(2)])
    await tienda.cargar()
    expect(tienda.nuevas).toHaveLength(0)
  })

  it('acumula varias solicitudes nuevas', async () => {
    listarMock.mockResolvedValueOnce([])
    const tienda = useSolicitudesStore()
    await tienda.cargar()
    listarMock.mockResolvedValueOnce([reservacion(3)])
    await tienda.cargar()
    listarMock.mockResolvedValueOnce([reservacion(3), reservacion(4)])
    await tienda.cargar()
    expect(tienda.nuevas.map((r) => r.idReservacion)).toEqual([3, 4])
  })

  it('no avisa de una reservación que la propia hostess acaba de crear', async () => {
    listarMock.mockResolvedValueOnce([])
    const tienda = useSolicitudesStore()
    await tienda.cargar()
    tienda.marcarVista(5)
    listarMock.mockResolvedValueOnce([reservacion(5)])
    await tienda.cargar()
    expect(tienda.nuevas).toHaveLength(0)
    expect(tienda.pendientes).toHaveLength(1)
  })

  it('quita del aviso la solicitud que ya se confirmó o canceló, y no falla si la consulta da error', async () => {
    listarMock.mockResolvedValueOnce([])
    const tienda = useSolicitudesStore()
    await tienda.cargar()
    listarMock.mockResolvedValueOnce([reservacion(6)])
    await tienda.cargar()
    expect(tienda.nuevas).toHaveLength(1)

    listarMock.mockRejectedValueOnce(new Error('sin red'))
    await tienda.cargar()
    expect(tienda.nuevas).toHaveLength(1)

    listarMock.mockResolvedValueOnce([])
    await tienda.cargar()
    expect(tienda.nuevas).toHaveLength(0)
  })
})
