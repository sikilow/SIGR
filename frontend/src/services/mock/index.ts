import { crearHostessMock } from '../hostess/mock'
import type { Servicios } from '../interfaces'
import { crearCatalogoMock, crearClientesMock, crearUsuariosMock } from './adminMock'
import { crearAuthMock } from './authMock'
import { crearCuentasMock } from './cuentasMock'
import { crearCajaMock } from './cajaMock'
import { crearMenuMock } from './menuMock'
import { crearMesasMock } from './mesasMock'
import { crearPedidosMock } from './pedidosMock'
import { crearReportesMock } from './reportesMock'
import { iniciarSimulacion } from './simulacion'

/** Servicios simulados en memoria, con retraso de 300 ms. */
export function crearServiciosMock(): Servicios {
  iniciarSimulacion()
  return {
    auth: crearAuthMock(),
    mesas: crearMesasMock(),
    menu: crearMenuMock(),
    pedidos: crearPedidosMock(),
    cuentas: crearCuentasMock(),
    caja: crearCajaMock(),
    usuarios: crearUsuariosMock(),
    clientes: crearClientesMock(),
    catalogo: crearCatalogoMock(),
    hostess: crearHostessMock(),
    reportes: crearReportesMock(),
  }
}
