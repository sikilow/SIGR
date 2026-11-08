import { describe, expect, it } from 'vitest'
import { crearLibroCorte } from './corteExcel'
import type { CorteCaja } from '../types'

describe('crearLibroCorte', () => {
  it('incluye el inicio, el cierre y los pagos por método en un XLSX válido', async () => {
    const corte: CorteCaja = {
      idCorte: 8,
      idCajero: 3,
      cajeroNombre: 'Cajero Demo',
      inicio: new Date('2026-11-07T10:00:00'),
      efectivoInicial: 600,
      totalVentas: 480,
      efectivoEsperado: 900,
      metodosPago: [
        { idMetodo: 1, nombre: 'Efectivo', cantidadPagos: 1, monto: 300 },
        { idMetodo: 2, nombre: 'Tarjeta', cantidadPagos: 0, monto: 0 },
        { idMetodo: 3, nombre: 'Transferencia', cantidadPagos: 1, monto: 180 },
      ],
      ventas: [{
        idVenta: 21,
        idCuenta: 14,
        mesaNumero: 4,
        fechaHora: new Date('2026-11-07T11:00:00'),
        total: 480,
        cajeroNombre: 'Cajero Demo',
        meseroNombre: 'Mesero Demo',
        pagos: [
          { metodo: 'Efectivo', monto: 300, montoRecibido: 320, cambio: 20 },
          { metodo: 'Transferencia', monto: 180, montoRecibido: 180, cambio: 0 },
        ],
      }],
      fin: new Date('2026-11-07T12:00:00'),
      tipoCierre: 'parcial',
      efectivoContado: 900,
      diferenciaEfectivo: 0,
    }

    const workbook = await crearLibroCorte(corte)
    const cuentas = workbook.getWorksheet('Cuentas cobradas')
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Corte', 'Cuentas cobradas'])
    expect(cuentas?.getCell('H2').value).toBe(300)
    expect(cuentas?.getCell('J2').value).toBe(180)
    expect(new Uint8Array(await workbook.xlsx.writeBuffer()).length).toBeGreaterThan(0)
  })
})