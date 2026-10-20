import { describe, expect, it } from 'vitest'
import type { EstadoReservacion, MesaSalon, Reservacion } from '../types'
import {
  accionesDisponibles,
  advertenciaCapacidadMesa,
  aDiaISO,
  aHoraISO,
  coincideBusqueda,
  combinarFechaHora,
  filtrarReservaciones,
  mesaPermitidaEnFecha,
  mesaSeLibera,
  mesasParaReservacion,
  normalizarTelefono,
  puedeCancelar,
  puedeConfirmar,
  puedeEditar,
  puedeRegistrarLlegada,
  sumarDias,
  transicionValida,
  validarCliente,
  validarFechaHora,
  validarPersonasReservacion,
} from './reservaciones'

// «Ahora» fijo para las pruebas: viernes 16 de octubre de 2026, 20:00:30.
const ahora = new Date(2026, 9, 16, 20, 0, 30)

const mesa = (idMesa: number, capacidad: number, estado: MesaSalon['estado'] = 'libre'): MesaSalon => ({
  idMesa,
  numero: idMesa,
  capacidad,
  estado,
})

const reservacion = (sobrescribir: Partial<Reservacion> = {}): Reservacion => ({
  idReservacion: 1,
  idCliente: 1,
  idMesa: null,
  fechaHora: new Date(2026, 9, 16, 21, 0),
  personas: 4,
  estado: 'pendiente',
  llegadaEn: null,
  clienteNombre: 'Carlos Medina',
  clienteTelefono: '3115550201',
  mesaNumero: null,
  ...sobrescribir,
})

const ESTADOS: EstadoReservacion[] = ['pendiente', 'confirmada', 'llego', 'cancelada', 'desconocido']

describe('reservaciones: transiciones y qué se puede hacer', () => {
  it.each([
    ['pendiente', true, true, true, true],
    ['confirmada', false, true, true, true],
    ['llego', false, false, false, false],
    ['cancelada', false, false, false, false],
    ['desconocido', false, false, false, false],
  ] as const)('%s → confirmar: %s, editar: %s, cancelar: %s, llegada: %s', (estado, confirmar, editar, cancelar, llegada) => {
    expect(puedeConfirmar(estado)).toBe(confirmar)
    expect(puedeEditar(estado)).toBe(editar)
    expect(puedeCancelar(estado)).toBe(cancelar)
    expect(puedeRegistrarLlegada(estado)).toBe(llegada)
  })

  it('las transiciones válidas son exactamente las del flujo', () => {
    const validas = ESTADOS.flatMap((d) => ESTADOS.filter((h) => transicionValida(d, h)).map((h) => `${d}>${h}`))
    expect(validas.sort()).toEqual(['confirmada>cancelada', 'confirmada>llego', 'pendiente>cancelada', 'pendiente>confirmada', 'pendiente>llego'])
  })

  it('llego y cancelada son finales: no cambian a ningún estado', () => {
    for (const final of ['llego', 'cancelada'] as const) {
      for (const hacia of ESTADOS) expect(transicionValida(final, hacia)).toBe(false)
    }
  })

  it('las acciones ofrecidas dependen del estado', () => {
    expect(accionesDisponibles('pendiente')).toEqual(['confirmar', 'llegada', 'editar', 'cancelar'])
    expect(accionesDisponibles('confirmada')).toEqual(['llegada', 'editar', 'cancelar'])
    expect(accionesDisponibles('llego')).toEqual([])
    expect(accionesDisponibles('cancelada')).toEqual([])
    expect(accionesDisponibles('desconocido')).toEqual([])
  })
})

describe('reservaciones: la mesa se libera al cancelar', () => {
  const todas = [
    { idReservacion: 1, idMesa: 7, estado: 'confirmada' as const },
    { idReservacion: 2, idMesa: 7, estado: 'pendiente' as const },
    { idReservacion: 3, idMesa: 9, estado: 'confirmada' as const },
    { idReservacion: 4, idMesa: 9, estado: 'cancelada' as const },
    { idReservacion: 5, idMesa: 10, estado: 'llego' as const },
  ]

  it('se libera si no queda otra vigente para esa mesa', () => {
    expect(mesaSeLibera(9, todas, 3)).toBe(true)
  })

  it('no se libera si otra reservación vigente la sigue necesitando', () => {
    expect(mesaSeLibera(7, todas, 1)).toBe(false)
    expect(mesaSeLibera(7, todas, 2)).toBe(false)
  })

  it('las canceladas y las que ya llegaron no cuentan', () => {
    expect(mesaSeLibera(9, todas, 3)).toBe(true)
    expect(mesaSeLibera(10, todas, 99)).toBe(true)
  })
})

describe('reservaciones: fechas', () => {
  it('combina día y hora local, y rechaza fechas que no existen', () => {
    expect(combinarFechaHora('2026-10-16', '20:30')).toEqual(new Date(2026, 9, 16, 20, 30))
    expect(combinarFechaHora('2026-02-31', '10:00')).toBeNull()
    expect(combinarFechaHora('2026-10-16', '25:00')).toBeNull()
    expect(combinarFechaHora('', '10:00')).toBeNull()
    expect(combinarFechaHora('2026-10-16', '')).toBeNull()
  })

  it('formatea día y hora para los campos de fecha y hora', () => {
    expect(aDiaISO(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05')
    expect(aHoraISO(new Date(2026, 0, 5, 9, 7))).toBe('09:07')
  })

  it('suma días cruzando de mes', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('al crear: una fecha de ayer o una hora que ya pasó se rechazan', () => {
    expect(validarFechaHora('2026-10-15', '21:00', ahora)).toEqual({ fecha: 'No se puede reservar en una fecha pasada.' })
    expect(validarFechaHora('2026-10-16', '19:59', ahora).hora).toMatch(/ya pasó/)
  })

  it('la hora actual (por minuto) todavía es válida', () => {
    expect(validarFechaHora('2026-10-16', '20:00', ahora)).toEqual({})
  })

  it('hoy más tarde, mañana y dentro de un año son válidos', () => {
    expect(validarFechaHora('2026-10-16', '21:30', ahora)).toEqual({})
    expect(validarFechaHora('2026-10-17', '09:00', ahora)).toEqual({})
    expect(validarFechaHora('2027-10-16', '09:00', ahora)).toEqual({})
  })

  it('más de un año por delante se rechaza', () => {
    expect(validarFechaHora('2027-10-18', '09:00', ahora).fecha).toMatch(/demasiado lejana/)
  })

  it('campos vacíos o inexistentes dan un error por campo', () => {
    expect(validarFechaHora('', '', ahora)).toEqual({ fecha: 'Elige la fecha de la reservación.', hora: 'Elige la hora de la reservación.' })
    expect(validarFechaHora('2026-10-16', '', ahora)).toEqual({ hora: 'Elige la hora de la reservación.' })
    expect(validarFechaHora('2026-02-31', '10:00', ahora).fecha).toMatch(/no son válidas/)
  })

  it('al editar sin mover la fecha no se vuelve a exigir que sea futura', () => {
    const original = new Date(2026, 9, 16, 19, 30)
    expect(validarFechaHora('2026-10-16', '19:30', ahora, original)).toEqual({})
    // pero si la mueve a otra hora pasada, sí se rechaza
    expect(validarFechaHora('2026-10-16', '19:45', ahora, original).hora).toMatch(/ya pasó/)
  })

  it('la mesa solo se permite para reservaciones de hoy', () => {
    expect(mesaPermitidaEnFecha(new Date(2026, 9, 16, 23, 59), ahora)).toBe(true)
    expect(mesaPermitidaEnFecha(new Date(2026, 9, 17, 0, 0), ahora)).toBe(false)
  })
})

describe('reservaciones: personas', () => {
  it.each([[1], [4], ['12'], [20]])('%s es válido', (valor) => {
    expect(validarPersonasReservacion(valor)).toBe('')
  })

  it.each([[''], ['  '], [0], [21], [-1], ['2.5'], ['abc']])('«%s» no es válido', (valor) => {
    expect(validarPersonasReservacion(valor)).not.toBe('')
  })
})

describe('reservaciones: mesas que se ofrecen', () => {
  const mesas = [mesa(1, 2), mesa(2, 4), mesa(3, 4, 'ocupada'), mesa(4, 6), mesa(5, 4, 'reservada'), mesa(6, 8)]

  it('solo libres, las que alcanzan primero y de la más justa a la más grande', () => {
    const opciones = mesasParaReservacion(mesas, 4, null)
    expect(opciones.map((o) => o.mesa.idMesa)).toEqual([2, 4, 6, 1])
    expect(opciones.map((o) => o.alcanza)).toEqual([true, true, true, false])
  })

  it('incluye la mesa que la reservación ya tiene, aunque esté reservada', () => {
    expect(mesasParaReservacion(mesas, 4, 5).map((o) => o.mesa.idMesa)).toContain(5)
    expect(mesasParaReservacion(mesas, 4, null).map((o) => o.mesa.idMesa)).not.toContain(5)
  })

  it('avisa si las personas no caben y no avisa si caben justas', () => {
    expect(advertenciaCapacidadMesa(mesa(1, 2), 3)).toMatch(/Son 3 personas y la mesa 1 es para 2/)
    expect(advertenciaCapacidadMesa(mesa(1, 2), 2)).toBeNull()
  })
})

describe('reservaciones: cliente nuevo', () => {
  const valido = { nombre: 'Laura Pérez', telefono: '3115550999', correo: '' }

  it('un cliente completo no tiene errores; el correo es opcional', () => {
    expect(validarCliente(valido)).toEqual({})
    expect(validarCliente({ ...valido, correo: 'laura@correo.com' })).toEqual({})
  })

  it('el teléfono acepta separadores y exige 10 dígitos', () => {
    expect(normalizarTelefono('(311) 555-0999')).toBe('3115550999')
    expect(validarCliente({ ...valido, telefono: '(311) 555-0999' })).toEqual({})
    expect(validarCliente({ ...valido, telefono: '555-0999' }).telefono).toMatch(/10 dígitos/)
    expect(validarCliente({ ...valido, telefono: '' }).telefono).toMatch(/Escribe el teléfono/)
  })

  it('nombre vacío o demasiado largo y correo mal escrito dan errores por campo', () => {
    expect(validarCliente({ ...valido, nombre: '   ' }).nombre).toMatch(/Escribe el nombre/)
    expect(validarCliente({ ...valido, nombre: 'x'.repeat(101) }).nombre).toMatch(/demasiado largo/)
    expect(validarCliente({ ...valido, correo: 'laura@' }).correo).toMatch(/correo válido/)
  })
})

describe('reservaciones: búsqueda y filtros', () => {
  const lista = [
    reservacion({ idReservacion: 1, clienteNombre: 'Familia González', clienteTelefono: '3115550203', fechaHora: new Date(2026, 9, 16, 22, 0), estado: 'pendiente' }),
    reservacion({ idReservacion: 2, clienteNombre: 'Carlos Medina', clienteTelefono: '3115550201', fechaHora: new Date(2026, 9, 16, 21, 0), estado: 'confirmada' }),
    reservacion({ idReservacion: 3, clienteNombre: 'Elena Castillo', clienteTelefono: null, fechaHora: new Date(2026, 9, 16, 19, 0), estado: 'cancelada' }),
  ]

  it('busca por nombre sin importar mayúsculas ni acentos', () => {
    expect(coincideBusqueda('Familia González', null, 'gonzalez')).toBe(true)
    expect(coincideBusqueda('Familia González', null, 'FAMILIA')).toBe(true)
    expect(coincideBusqueda('Familia González', null, 'lopez')).toBe(false)
  })

  it('busca por teléfono con al menos 3 dígitos (con o sin separadores)', () => {
    expect(coincideBusqueda('Carlos', '3115550201', '0201')).toBe(true)
    expect(coincideBusqueda('Carlos', '3115550201', '(311) 555')).toBe(true)
    expect(coincideBusqueda('Carlos', '3115550201', '02')).toBe(false)
    expect(coincideBusqueda('Elena', null, '311')).toBe(false)
  })

  it('texto vacío coincide con todo', () => {
    expect(coincideBusqueda('Cualquiera', null, '   ')).toBe(true)
  })

  it('filtra por estado, por texto y ordena por hora sin modificar el original', () => {
    const copia = [...lista]
    expect(filtrarReservaciones(lista, 'todas', '').map((r) => r.idReservacion)).toEqual([3, 2, 1])
    expect(filtrarReservaciones(lista, 'confirmada', '').map((r) => r.idReservacion)).toEqual([2])
    expect(filtrarReservaciones(lista, 'todas', 'gonzalez').map((r) => r.idReservacion)).toEqual([1])
    expect(filtrarReservaciones(lista, 'pendiente', 'medina')).toEqual([])
    expect(lista).toEqual(copia)
  })
})
