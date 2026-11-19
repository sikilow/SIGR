<script setup lang="ts">
// Vigila la inactividad de quien tiene sesión (personal): un minuto antes de que la API cierre la sesión muestra un aviso
// con cuenta regresiva; si no hay respuesta, cierra la sesión y manda al inicio de sesión. Se monta una sola vez en App.vue.
import { computed } from 'vue'
import { servicios } from '../services'
import { useInactividad } from '../composables/useInactividad'
import { useSesionStore } from '../stores/sesion'
import { limpiarToken } from '../services/api/token'
import DialogoModal from './DialogoModal.vue'

const sesion = useSesionStore()
const minutos = computed(() => sesion.usuario?.inactividadMinutos ?? 0)

const { faltan, avisoVisible, seguirAqui } = useInactividad({
  minutos,
  avisarActividad: () => servicios.auth.registrarActividad(),
  alVencer() {
    // Se sale con una navegación completa: así no la detiene la pregunta de «tienes un pedido sin registrar» (el borrador
    // queda guardado) y se limpia todo el estado de la pantalla.
    void servicios.auth.cerrarSesion().finally(() => {
      limpiarToken()
      window.location.assign('/login?motivo=inactividad')
    })
  },
})

const textoTiempo = computed(() => {
  const s = faltan.value ?? 0
  return s >= 60 ? '1 minuto' : `${s} ${s === 1 ? 'segundo' : 'segundos'}`
})
</script>

<template>
  <DialogoModal :abierto="avisoVisible" etiqueta-id="inactividad-titulo" variante="centro" :cerrable="false" @cerrar="seguirAqui">
    <div class="inactividad" role="alertdialog" aria-describedby="inactividad-texto">
      <h2 id="inactividad-titulo">¿Sigues ahí?</h2>
      <p id="inactividad-texto">
        Por seguridad, tu sesión se cerrará por inactividad en <strong class="numero">{{ textoTiempo }}</strong>. Lo que tengas sin guardar
        podría perderse.
      </p>
      <button type="button" class="btn btn--grande" autofocus @click="seguirAqui">Seguir aquí</button>
    </div>
  </DialogoModal>
</template>

<style scoped>
.inactividad {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.inactividad h2,
.inactividad p {
  margin: 0;
}
</style>
