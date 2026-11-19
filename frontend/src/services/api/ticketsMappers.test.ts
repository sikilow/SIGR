import { describe, expect, it } from 'vitest'
import { aDevolucion, aReporteVentas, aReferenciaFiscal, aVentaDetalle, aVentaListado, type ReporteVentasDto } from './caja'

// Las formas de abajo son las que devuelve backend/src/controllers/ventas.ts (los importes pueden llegar como texto).
const devolucionDto = {
  id_devolucion: '7',
  id_venta: 3,
  mesa_numero: 8,
  total_venta: '480.00',
  estado: 'aprobada' as const,
  motivo: 'Llegó frío',
  total: '165.00',
  reponer_inventario: 1,
  solicitado_en: '2026-11-19 12:00:00',
  solicitante: 'Marta',
  resuelto_en: '2026-11-19 12:05:00',
  resolutor: 'Luis',
  nota_resolucion: null,
  id_corte: 4,
  lineas: [{ id_detalle: 11, producto: 'Enchiladas', presentacion: null, cantidad: 1, importe: '165.00' }],
  pagos: [{ id_metodo: 1, metodo: 'Efectivo', es_efectivo: 1, monto: '165.00' }],
}

describe('mapeo de tickets y devoluciones', () => {
  it('convierte una venta de la lista', () => {
    const v = aVentaListado({
      id_venta: '3',
      fecha_hora: '2026-11-19 11:30:00',
      total: '480.00',
      mesa_numero: 8,
      seccion: 'Terraza',
      canal: null,
      cajero: 'Marta',
      metodos: 'Efectivo, Tarjeta',
      devuelto: '165.00',
      estado_devolucion: 'parcial',
      devoluciones_pendientes: '1',
      con_referencia_fiscal: true,
    })
    expect(v).toMatchObject({ idVenta: 3, total: 480, devuelto: 165, estadoDevolucion: 'parcial', devolucionesPendientes: 1, conReferenciaFiscal: true })
    expect(v.fechaHora).toBeInstanceOf(Date)
  })

  it('el cajero no recibe `con_referencia_fiscal`: el campo no aparece', () => {
    const v = aVentaListado({ id_venta: 1, fecha_hora: '2026-11-19 11:30:00', total: 10, mesa_numero: 1, seccion: null, canal: null, cajero: 'M', metodos: 'Efectivo', devuelto: 0, estado_devolucion: 'ninguna', devoluciones_pendientes: 0 })
    expect(v).not.toHaveProperty('conReferenciaFiscal')
  })

  it('convierte una devolución con sus líneas y métodos', () => {
    const d = aDevolucion(devolucionDto)
    expect(d).toMatchObject({ idDevolucion: 7, total: 165, reponerInventario: true, idCorte: 4, estado: 'aprobada' })
    expect(d.lineas[0]).toEqual({ idDetalle: 11, producto: 'Enchiladas', presentacion: null, cantidad: 1, importe: 165 })
    expect(d.pagos[0]).toEqual({ idMetodo: 1, metodo: 'Efectivo', esEfectivo: true, monto: 165 })
    expect(d.resueltoEn).toBeInstanceOf(Date)
    expect(aDevolucion({ ...devolucionDto, estado: 'pendiente', resuelto_en: null, resolutor: null, id_corte: null })).toMatchObject({ resueltoEn: null, idCorte: null })
  })

  it('convierte el ticket completo; la referencia fiscal solo existe si la API la manda', () => {
    const dto = {
      id_venta: 3,
      id_cuenta: 3,
      fecha_hora: '2026-11-19 11:30:00',
      total: '480.00',
      cajero: 'Marta',
      meseros: 'Ana',
      mesa_numero: 8,
      seccion: null,
      canal: null,
      referencia: null,
      lineas: [{ id_detalle: 11, producto: 'Enchiladas', presentacion: null, cantidad: 2, precio_unitario: '165.00', importe: '330.00', indicaciones: null, devuelta: 1, pendiente: 0 }],
      pagos: [{ id_metodo: 1, metodo: 'Efectivo', es_efectivo: 1, monto: '300.00', monto_recibido: '300.00', cambio: '0.00', devuelto: '165.00', pendiente: '0.00' }],
      devoluciones: [devolucionDto],
      devuelto: '165.00',
      estado_devolucion: 'parcial' as const,
      reimpresiones: '2',
      ultima_reimpresion: '2026-11-19 13:00:00',
    }
    const sinFiscal = aVentaDetalle(dto)
    expect(sinFiscal).toMatchObject({ idVenta: 3, total: 480, devuelto: 165, reimpresiones: 2 })
    expect(sinFiscal.lineas[0]).toMatchObject({ precioUnitario: 165, devuelta: 1 })
    expect(sinFiscal.pagos[0]).toMatchObject({ esEfectivo: true, devuelto: 165 })
    expect(sinFiscal.ultimaReimpresion).toBeInstanceOf(Date)
    expect(sinFiscal).not.toHaveProperty('referenciaFiscal')

    expect(aVentaDetalle({ ...dto, referencia_fiscal: null }).referenciaFiscal).toBeNull()
    const fiscal = aReferenciaFiscal({ referencia_contador: 'F-1', rfc: null, razon_social: null, regimen_fiscal: null, codigo_postal: null, correo: null, notas: null, registrado_por: 'Luis', actualizado_en: '2026-11-19 14:00:00' })
    expect(aVentaDetalle({ ...dto, referencia_fiscal: { referencia_contador: 'F-1', rfc: null, razon_social: null, regimen_fiscal: null, codigo_postal: null, correo: null, notas: null, registrado_por: 'Luis', actualizado_en: '2026-11-19 14:00:00' } }).referenciaFiscal).toEqual(fiscal)
  })

  it('el reporte de ventas trae devoluciones y neto; una API anterior a la 034 los deja en cero', () => {
    const base: ReporteVentasDto = {
      desde: '2026-11-01',
      hasta: '2026-11-30',
      resumen: { ventas: 3, total: '900.50', devoluciones: 1, devuelto: '165.00', neto: '735.50' },
      por_dia: [],
      por_hora: [],
      por_metodo: [],
      por_mesero: [],
      por_producto: [],
      por_categoria: [],
      por_seccion: [],
      ventas: [],
      ventas_truncadas: false,
    }
    expect(aReporteVentas(base).resumen).toEqual({ ventas: 3, total: 900.5, devoluciones: 1, devuelto: 165, neto: 735.5 })
    expect(aReporteVentas({ ...base, resumen: { ventas: 3, total: '900.50' } }).resumen).toEqual({ ventas: 3, total: 900.5, devoluciones: 0, devuelto: 0, neto: 900.5 })
  })
})
