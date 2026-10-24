import type { Mesa } from '../../types'
import { esPedidoActivo } from '../../utils/reglas'
import type { MesasService } from '../interfaces'
import { baseDatos, type MesaGuardada } from './baseDatos'
import { conRetraso } from './utiles'

/** Agrega a la mesa el resumen de su cuenta activa y de sus pedidos. */
function conResumen(mesaGuardada: MesaGuardada): Mesa {
  // La disponibilidad no viaja en el panel (solo se listan las mesas disponibles); la sección sí, como en GET /mesas.
  const { activa: _activa, ...mesa } = mesaGuardada
  const cuenta = baseDatos.cuentas.find((c) => c.idMesa === mesa.idMesa && c.estado !== 'cerrada')
  const pedidos = cuenta ? baseDatos.pedidos.filter((p) => p.idCuenta === cuenta.idCuenta) : []

  return {
    ...mesa,
    estadoCuenta: cuenta && cuenta.estado !== 'cerrada' ? cuenta.estado : null,
    pedidosActivos: pedidos.filter((p) => esPedidoActivo(p.estado)).length,
    tipoPagoSolicitado: cuenta?.tipoPagoSolicitado ?? null,
    totalCuenta: pedidos.filter((p) => p.estado !== 'cancelado').reduce((suma, p) => suma + p.total, 0),
    pedidosListos: pedidos.filter((p) => p.estado === 'listo').length,
  }
}

export function crearMesasMock(): MesasService {
  return {
    listar() {
      return conRetraso(() => baseDatos.mesas
        .filter((m) => m.activa && baseDatos.secciones.some((s) => s.nombre === m.zona && s.activa))
        .map(conResumen))
    },
  }
}
