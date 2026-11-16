import { defineStore } from 'pinia'
import { ref } from 'vue'
import { servicios } from '../services'
import type { Reservacion } from '../types'

/**
 * Solicitudes de reservación sin confirmar (estado `pendiente`) para avisar a la hostess.
 *
 *  - `pendientes`: todas las que siguen sin confirmar (de cualquier día); alimenta la insignia del menú.
 *  - `nuevas`: las que llegaron desde la última vez que la hostess descartó el aviso; alimenta la alerta en pantalla.
 *
 * La primera consulta solo toma nota de lo que ya había (la insignia lo muestra): no hay alerta por lo anterior.
 * Una reservación que la propia hostess acaba de crear se marca como vista para no avisarle de lo que ella hizo.
 */
export const useSolicitudesStore = defineStore('solicitudes', () => {
  const pendientes = ref<Reservacion[]>([])
  const nuevas = ref<Reservacion[]>([])
  const vistas = new Set<number>()
  let inicializado = false

  async function cargar(): Promise<void> {
    let actuales: Reservacion[]
    try {
      actuales = await servicios.hostess.listarReservacionesPendientes()
    } catch {
      // Sin red o con error: se conserva lo anterior; la siguiente consulta lo reintenta.
      return
    }
    pendientes.value = actuales
    const vigentes = new Set(actuales.map((r) => r.idReservacion))

    if (!inicializado) {
      for (const r of actuales) vistas.add(r.idReservacion)
      inicializado = true
      return
    }

    const recientes = actuales.filter((r) => !vistas.has(r.idReservacion))
    for (const r of recientes) vistas.add(r.idReservacion)
    // Si una solicitud ya se confirmó o canceló mientras tanto, deja de ser noticia.
    nuevas.value = [...nuevas.value, ...recientes].filter((r) => vigentes.has(r.idReservacion))
  }

  /** La hostess ya vio el aviso. */
  function descartar(): void {
    nuevas.value = []
  }

  /** Reservación creada desde esta pantalla: no se avisa de ella. */
  function marcarVista(idReservacion: number): void {
    vistas.add(idReservacion)
  }

  return { pendientes, nuevas, cargar, descartar, marcarVista }
})
