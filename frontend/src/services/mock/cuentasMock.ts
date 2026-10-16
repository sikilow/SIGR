import type { Cuenta } from '../../types'
import { ErrorServicio } from '../errores'
import type { CuentasService } from '../interfaces'
import { baseDatos, type CuentaGuardada } from './baseDatos'
import { conRetraso, conRetrasoIdempotente } from './utiles'

/** Arma la cuenta con sus pedidos; el total excluye los pedidos cancelados. */
function componerCuenta(guardada: CuentaGuardada): Cuenta {
  const pedidos = baseDatos.pedidos.filter((p) => p.idCuenta === guardada.idCuenta)
  const total = pedidos
    .filter((p) => p.estado !== 'cancelado')
    .reduce((suma, p) => suma + p.total, 0)
  return { ...guardada, pedidos, total }
}

export function crearCuentasMock(): CuentasService {
  return {
    obtenerPorMesa(idMesa) {
      return conRetraso(() => {
        const guardada = baseDatos.cuentas.find((c) => c.idMesa === idMesa && c.estado !== 'cerrada')
        return guardada ? componerCuenta(guardada) : null
      })
    },

    solicitarPago(idCuenta, tipo, claveIdempotencia) {
      return conRetrasoIdempotente(claveIdempotencia, () => {
        const guardada = baseDatos.cuentas.find((c) => c.idCuenta === idCuenta)
        if (!guardada) throw new ErrorServicio('no_encontrado', `La cuenta ${idCuenta} no existe.`, 404)
        if (guardada.estado !== 'abierta') {
          throw new ErrorServicio('estado_invalido', 'La cuenta no está abierta.', 409)
        }
        // Sin pedidos vigentes no hay nada que cobrar (SUPOSICIÓN: la API también debe rechazarlo).
        if (componerCuenta(guardada).total === 0) {
          throw new ErrorServicio('estado_invalido', 'La cuenta no tiene pedidos activos.', 409)
        }
        guardada.estado = 'por_pagar'
        guardada.tipoPagoSolicitado = tipo
        return componerCuenta(guardada)
      })
    },
  }
}
