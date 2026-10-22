import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearServiciosApi } from './index'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('servicio de cocina', () => {
  it('envía PATCH /pedidos/:id/estado y convierte el pedido devuelto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id_pedido: 7,
          id_cuenta: 3,
          id_mesero: 2,
          estado: 'En preparacion',
          fecha_hora: '2026-10-21 19:00:00',
          id_motivo: null,
          id_mesa: 4,
          mesa_numero: 4,
          motivo_descripcion: null,
          total: 0,
          detalle: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pedido = await crearServiciosApi().pedidos.cambiarEstadoCocina(7, 'en_preparacion')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pedidos/7/estado',
      expect.objectContaining({ method: 'PATCH', body: '{"estado":"en_preparacion"}' }),
    )
    expect(pedido).toMatchObject({ idPedido: 7, estado: 'en_preparacion', mesaNumero: 4 })
  })
})
