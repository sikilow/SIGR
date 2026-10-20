// Mappers de H3: lista de espera (valores estilo PDO, nulos, estados desconocidos) y cuerpos de alta y de cambio.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aListaEspera, deCambioEspera, deNuevaEspera, type ListaEsperaDto } from './mappers'

let advertencia: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  advertencia = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

const dto: ListaEsperaDto = {
  id_espera: '4',
  id_cliente: '6',
  personas: '3',
  registrado_en: '2026-10-16 19:35:10',
  estado: 'Esperando',
  cliente_nombre: 'Héctor Salas',
  cliente_telefono: null,
}

describe('aListaEspera (casos de H3)', () => {
  it('todo como texto estilo PDO y teléfono nulo', () => {
    const e = aListaEspera(dto)
    expect(e).toMatchObject({ idEspera: 4, idCliente: 6, personas: 3, estado: 'esperando', clienteNombre: 'Héctor Salas', clienteTelefono: null })
    expect(e.registradoEn).toEqual(new Date(2026, 9, 16, 19, 35, 10))
  })

  it.each([
    ['esperando', 'esperando'],
    ['ASIGNADA', 'asignada'],
    [' Cancelada ', 'cancelada'],
  ])('el estado «%s» se normaliza a «%s» sin advertir', (original, esperado) => {
    expect(aListaEspera({ ...dto, estado: original }).estado).toBe(esperado)
    expect(advertencia).not.toHaveBeenCalled()
  })

  it('un estado desconocido (también «cancelado» mal escrito) da «desconocido» con UNA advertencia', () => {
    expect(aListaEspera({ ...dto, estado: 'cancelado' }).estado).toBe('desconocido')
    expect(advertencia).toHaveBeenCalledTimes(1)
    expect(advertencia.mock.calls[0]![0]).toContain('cancelado')
  })

  it('una fecha imposible o un número inválido son errores de contrato', () => {
    expect(() => aListaEspera({ ...dto, registrado_en: '2026-02-31 10:00:00' })).toThrow(/registrado_en/)
    expect(() => aListaEspera({ ...dto, personas: 'x' })).toThrow(/personas/)
  })

  it('un teléfono vacío o con espacios es null', () => {
    expect(aListaEspera({ ...dto, cliente_telefono: '  ' }).clienteTelefono).toBeNull()
    expect(aListaEspera({ ...dto, cliente_telefono: '3115550206' }).clienteTelefono).toBe('3115550206')
  })
})

describe('cuerpos que se envían a la API (nombres exactos de columna)', () => {
  it('POST /lista-espera: id_cliente y personas (el resto lo pone la API)', () => {
    expect(deNuevaEspera({ idCliente: 6, personas: 3 })).toEqual({ id_cliente: 6, personas: 3 })
  })

  it('PATCH /lista-espera/{id}: solo el estado', () => {
    expect(deCambioEspera({ estado: 'cancelada' })).toEqual({ estado: 'cancelada' })
  })
})
