import type { Cuenta } from '../../types'
import { ErrorServicio } from '../errores'
import type { CuentasService } from '../interfaces'
import { baseDatos, type CuentaGuardada } from './baseDatos'
import { conRetraso } from './utiles'

/** Arma la cuenta con sus pedidos; el total excluye los pedidos cancelados. */
function componerCuenta(guardada: CuentaGuardada): Cuenta {
  const pedidos = baseDatos.pedidos.filter((p) => p.cuentaId === guardada.id)
  const total = pedidos
    .filter((p) => p.estado !== 'cancelado')
    .reduce((suma, p) => suma + p.total, 0)
  return { ...guardada, pedidos, total }
}

export function crearCuentasMock(): CuentasService {
  return {
    obtenerPorMesa(mesaId) {
      return conRetraso(() => {
        const guardada = baseDatos.cuentas.find((c) => c.mesaId === mesaId && c.estado !== 'cerrada')
        return guardada ? componerCuenta(guardada) : null
      })
    },

    solicitarPago(cuentaId, tipo) {
      return conRetraso(() => {
        const guardada = baseDatos.cuentas.find((c) => c.id === cuentaId)
        if (!guardada) throw new ErrorServicio('no_encontrado', `La cuenta ${cuentaId} no existe.`, 404)
        if (guardada.estado !== 'abierta') {
          throw new ErrorServicio('estado_invalido', 'La cuenta no está abierta.', 409)
        }
        guardada.estado = 'por_pagar'
        guardada.tipoPagoSolicitado = tipo
        return componerCuenta(guardada)
      })
    },
  }
}
