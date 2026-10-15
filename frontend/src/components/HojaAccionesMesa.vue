<script setup lang="ts">
// Hoja de acciones (bottom sheet) de una mesa, sobre DialogoModal (foco atrapado, Escape,
// foco de regreso a la tarjeta). Solo una mesa OCUPADA ofrece acciones de pedido; libre o
// reservada solo se puede cerrar (la hostess asigna la mesa).
import { computed, ref } from 'vue'
import { ETIQUETA_ESTADO_MESA, type Mesa } from '../types'
import { formatearCapacidad, formatearMoneda, formatearPedidosActivos } from '../utils/formato'
import DialogoModal from './DialogoModal.vue'
import InsigniaEstado from './InsigniaEstado.vue'

const props = defineProps<{ mesa: Mesa | null }>()
const emit = defineEmits<{ cerrar: [] }>()

const dialogo = ref<InstanceType<typeof DialogoModal> | null>(null)

const ocupada = computed(() => props.mesa?.estado === 'ocupada')
const cuentaSolicitada = computed(() => props.mesa?.estadoCuenta === 'por_pagar')

/** Los botones "deshabilitados" siguen enfocables (para leer el motivo) pero no actúan. */
function bloquear(evento: Event) {
  evento.preventDefault()
}
</script>

<template>
  <DialogoModal ref="dialogo" :abierto="mesa !== null" etiqueta-id="hoja-titulo" variante="hoja" @cerrar="emit('cerrar')">
    <div v-if="mesa" class="hoja__contenido">
      <header class="hoja__cabecera">
        <h2 id="hoja-titulo">Mesa {{ mesa.numero }}</h2>
        <InsigniaEstado :tono="mesa.estado" :texto="ETIQUETA_ESTADO_MESA[mesa.estado]" />
      </header>

      <!-- Mesa ocupada: acciones de pedido -->
      <template v-if="ocupada">
        <p class="hoja__resumen">
          {{ formatearCapacidad(mesa.capacidad) }} · {{ formatearPedidosActivos(mesa.pedidosActivos) }} ·
          <strong class="numero">{{ formatearMoneda(mesa.totalCuenta) }}</strong>
        </p>

        <div class="hoja__acciones">
          <RouterLink
            v-if="!cuentaSolicitada"
            class="btn hoja__boton"
            :to="{ name: 'mesero-pedido-mesa', params: { mesaId: mesa.id } }"
            autofocus
          >
            Nuevo pedido
          </RouterLink>
          <template v-else>
            <button
              type="button"
              class="btn hoja__boton"
              aria-disabled="true"
              aria-describedby="hoja-aviso-cuenta"
              autofocus
              @click="bloquear"
            >
              Nuevo pedido
            </button>
            <p id="hoja-aviso-cuenta" class="hoja__aviso">
              <InsigniaEstado tono="cuenta" texto="La cuenta ya fue solicitada" />
            </p>
          </template>

          <RouterLink
            class="btn btn--secundario hoja__boton"
            :to="{ name: 'mesero-cuenta-mesa', params: { mesaId: mesa.id } }"
          >
            Ver cuenta
          </RouterLink>
          <RouterLink
            class="btn btn--secundario hoja__boton"
            :to="{ name: 'mesero-pedidos', query: { mesa: mesa.id } }"
          >
            Pedidos de la mesa
          </RouterLink>
        </div>
      </template>

      <!-- Mesa libre o reservada: sin acciones de pedido (la hostess asigna la mesa) -->
      <p v-else class="hoja__resumen">Esta mesa no tiene clientes sentados; la hostess la asigna.</p>

      <button
        type="button"
        class="btn btn--secundario hoja__boton"
        :autofocus="!ocupada"
        @click="dialogo?.cerrar()"
      >
        Cerrar
      </button>
    </div>
  </DialogoModal>
</template>

<style scoped>
.hoja__contenido {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.hoja__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
}

.hoja__resumen {
  margin: 0;
  color: var(--color-text);
}

.hoja__acciones {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.hoja__boton {
  min-height: 56px;
  width: 100%;
  font-size: var(--texto-lg);
  text-decoration: none;
}

.hoja__aviso {
  margin: calc(var(--espacio-1) * -1) 0 0;
}
</style>
