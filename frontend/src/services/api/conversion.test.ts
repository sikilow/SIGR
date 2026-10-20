import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aBooleano,
  aEstadoCuenta,
  aEstadoMesa,
  aEstadoPedido,
  aNumero,
  aNumeroONulo,
  aRol,
  normalizarCodigo,
  parseFechaMySQL,
  parseFechaMySQLONula,
} from './conversion'

/** Las advertencias de "estado desconocido" van a consola: se espían para no ensuciar la salida y poder comprobarlas. */
let advertencia: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  advertencia = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  advertencia.mockRestore()
})

describe('aNumero (INT y DECIMAL de PDO)', () => {
  it('acepta números y texto numérico', () => {
    expect(aNumero(12)).toBe(12)
    expect(aNumero('12')).toBe(12)
    expect(aNumero('120.00')).toBe(120)
    expect(aNumero('80.5')).toBe(80.5)
    expect(aNumero(' 7 ')).toBe(7)
    expect(aNumero(0)).toBe(0)
    expect(aNumero('0.00')).toBe(0)
  })

  it.each([null, undefined, '', '  ', 'abc', '12abc', NaN, Infinity, {}, [], true])('rechaza %j', (valor) => {
    expect(() => aNumero(valor, 'precio')).toThrow(/precio/)
  })

  it('aNumeroONulo conserva null/undefined y convierte el resto', () => {
    expect(aNumeroONulo(null)).toBeNull()
    expect(aNumeroONulo(undefined)).toBeNull()
    expect(aNumeroONulo('3')).toBe(3)
    expect(() => aNumeroONulo('x')).toThrow()
  })
})

describe('aBooleano (BOOLEAN de PDO)', () => {
  it.each([true, 1, '1', 'true'])('%j es verdadero', (valor) => {
    expect(aBooleano(valor)).toBe(true)
  })

  it.each([false, 0, '0', 'false', '', null, undefined])('%j es falso', (valor) => {
    expect(aBooleano(valor)).toBe(false)
  })

  it.each([2, '2', 'si', {}, []])('rechaza %j', (valor) => {
    expect(() => aBooleano(valor, 'disponible')).toThrow(/disponible/)
  })
})

describe('parseFechaMySQL (DATETIME sin zona horaria = hora local)', () => {
  it('interpreta "2026-10-15 16:34:00" como hora LOCAL', () => {
    const fecha = parseFechaMySQL('2026-10-15 16:34:00')
    expect(fecha.getFullYear()).toBe(2026)
    expect(fecha.getMonth()).toBe(9)
    expect(fecha.getDate()).toBe(15)
    expect(fecha.getHours()).toBe(16)
    expect(fecha.getMinutes()).toBe(34)
    expect(fecha.getSeconds()).toBe(0)
    // Equivale al constructor local, nunca a UTC.
    expect(fecha.getTime()).toBe(new Date(2026, 9, 15, 16, 34, 0).getTime())
  })

  it('acepta el separador T y fracciones de segundo', () => {
    expect(parseFechaMySQL('2026-01-02T03:04:05').getTime()).toBe(new Date(2026, 0, 2, 3, 4, 5).getTime())
    expect(parseFechaMySQL('2026-01-02 03:04:05.123456').getHours()).toBe(3)
  })

  it('respeta una zona horaria explícita (ISO 8601)', () => {
    expect(parseFechaMySQL('2026-10-14T18:30:00Z').toISOString()).toBe('2026-10-14T18:30:00.000Z')
  })

  it.each(['', 'not-a-date', '2026-02-31 10:00:00', '0000-00-00 00:00:00', '2026-10-15', '2026-10-15 25:00:00'])(
    'rechaza %j',
    (texto) => {
      expect(() => parseFechaMySQL(texto, 'fecha_hora')).toThrow(/fecha_hora/)
    },
  )

  it('rechaza lo que no es texto y permite NULL con la variante opcional', () => {
    expect(() => parseFechaMySQL(null)).toThrow()
    expect(() => parseFechaMySQL(1760000000)).toThrow()
    expect(parseFechaMySQLONula(null)).toBeNull()
    expect(parseFechaMySQLONula(undefined)).toBeNull()
    expect(parseFechaMySQLONula('2026-10-15 16:34:00')).toBeInstanceOf(Date)
  })
})

describe('normalizarCodigo', () => {
  it('minúsculas, sin acentos y con guion bajo', () => {
    expect(normalizarCodigo('En preparacion')).toBe('en_preparacion')
    expect(normalizarCodigo('  EN PREPARACIÓN ')).toBe('en_preparacion')
    expect(normalizarCodigo('por-pagar')).toBe('por_pagar')
    expect(normalizarCodigo(null)).toBe('')
  })
})

describe('estados de pedido (catálogo estado_pedido)', () => {
  it.each([
    ['Pendiente', 'pendiente'],
    ['En preparacion', 'en_preparacion'],
    ['Listo', 'listo'],
    ['Entregado', 'entregado'],
    ['Cancelado', 'cancelado'],
    // Con acentos o ya normalizados también llegan bien
    ['En preparación', 'en_preparacion'],
    ['en_preparacion', 'en_preparacion'],
  ])('%s → %s', (nombre, codigo) => {
    expect(aEstadoPedido(nombre)).toBe(codigo)
    expect(advertencia).not.toHaveBeenCalled()
  })

  it('los estados sin equivalente en la BD se siguen reconociendo', () => {
    expect(aEstadoPedido('Registrado')).toBe('registrado')
    expect(aEstadoPedido('Enviado')).toBe('enviado')
    expect(aEstadoPedido('Pagado')).toBe('pagado')
  })

  it.each(['Archivado', '', null, undefined, 7])('un estado desconocido (%j) no rompe: da "desconocido" y advierte', (valor) => {
    expect(aEstadoPedido(valor)).toBe('desconocido')
    expect(advertencia).toHaveBeenCalledTimes(1)
  })
})

describe('estados de mesa y de cuenta (con CHECK en la BD)', () => {
  it('mesa: libre, ocupada y reservada', () => {
    // La BD (CHECK de init.sql) guarda `libre`, `ocupada` y `reservada`.
    expect(aEstadoMesa('libre')).toBe('libre')
    expect(aEstadoMesa('Libre')).toBe('libre')
    // Tolerancia: el nombre anterior `disponible` (en cualquier forma) se entiende como `libre`, sin advertencia.
    expect(aEstadoMesa('disponible')).toBe('libre')
    expect(aEstadoMesa('Disponible')).toBe('libre')
    expect(aEstadoMesa('  DISPONIBLE ')).toBe('libre')
    expect(aEstadoMesa('Ocupada')).toBe('ocupada')
    expect(aEstadoMesa('RESERVADA')).toBe('reservada')
  })

  it('mesa: lo que no esté en la lista es desconocido', () => {
    expect(aEstadoMesa('en limpieza')).toBe('desconocido')
    expect(aEstadoMesa('')).toBe('desconocido')
    expect(advertencia).toHaveBeenCalledTimes(2)
  })

  it('cuenta: abierta, por_pagar y cerrada; el resto es desconocido', () => {
    expect(aEstadoCuenta('abierta')).toBe('abierta')
    expect(aEstadoCuenta('Por pagar')).toBe('por_pagar')
    expect(aEstadoCuenta('cerrada')).toBe('cerrada')
    expect(aEstadoCuenta('anulada')).toBe('desconocido')
    expect(advertencia).toHaveBeenCalledTimes(1)
  })
})

describe('roles (rol.nombre)', () => {
  it.each([
    ['Gerente', 'gerente'],
    ['Mesero', 'mesero'],
    ['Cocinero', 'cocinero'],
    ['Cajero', 'cajero'],
    ['Hostess', 'hostess'],
    ['mesero', 'mesero'],
  ])('%s → %s', (nombre, codigo) => {
    expect(aRol(nombre)).toBe(codigo)
  })

  it('un rol que no se reconoce da null y advierte', () => {
    expect(aRol('Contador')).toBeNull()
    expect(advertencia).toHaveBeenCalledTimes(1)
  })
})
