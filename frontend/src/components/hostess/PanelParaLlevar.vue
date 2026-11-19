<script setup lang="ts">
// «Para llevar» del Salón: la hostess recibe el pedido de una plataforma (Didi, Rappi, Uber Eats…) o por teléfono y lo
// asigna a una mesa virtual de «Para llevar»; el mesero la ve ocupada en su panel y le toma el pedido. Aquí se ve qué
// pedidos para llevar están abiertos, en qué mesa virtual y con qué canal. Se puede liberar uno que se abrió por error
// (solo si todavía no tiene productos: si ya los tiene, se atiende en Caja).
import type { Mesa } from '../../types'
import { formatearPedidosActivos } from '../../utils/formato'

defineProps<{
  pedidos: Mesa[]
  error?: boolean
  /** Hay una liberación en curso: se bloquean los botones. */
  ocupado?: boolean
}>()

const emit = defineEmits<{
  nuevo: [evento: Event]
  liberar: [mesa: Mesa, evento: Event]
}>()
</script>

<template>
  <section class="panel" aria-labelledby="panel-llevar">
    <div class="panel__encabezado">
      <h3 id="panel-llevar">Para llevar</h3>
      <button type="button" class="btn" @click="emit('nuevo', $event)">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nuevo pedido
      </button>
    </div>
    <p class="panel__ayuda">Se asigna a una mesa virtual y el mesero toma el pedido desde su panel de mesas.</p>

    <p v-if="pedidos.length === 0" class="panel__vacio">
      {{ error ? 'No se pudieron cargar los pedidos para llevar.' : 'No hay pedidos para llevar abiertos.' }}
    </p>
    <ul v-else class="panel__lista">
      <li v-for="m in pedidos" :key="m.idMesa" class="item">
        <span class="item__cuerpo">
          <strong class="item__nombre">Mesa {{ m.numero }} · {{ m.canal ?? 'Sin canal' }}</strong>
          <span v-if="m.referencia" class="item__detalle">{{ m.referencia }}</span>
          <span class="item__detalle">{{ m.pedidosActivos === 0 ? 'El mesero aún no toma el pedido' : formatearPedidosActivos(m.pedidosActivos) }}</span>
        </span>
        <button
          v-if="m.pedidosActivos === 0"
          type="button"
          class="btn btn--secundario item__liberar"
          :aria-label="`Liberar la mesa para llevar ${m.numero}`"
          :disabled="ocupado"
          @click="emit('liberar', m, $event)"
        >
          Liberar
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  padding: var(--espacio-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.panel__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-2);
}

.panel__encabezado h3 {
  margin: 0;
}

.panel__ayuda,
.panel__vacio {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.panel__lista {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3);
  min-height: var(--tactil-min);
  padding: var(--espacio-2) 0;
  border-top: 1px solid var(--color-border);
}

.item:first-child {
  border-top: none;
  padding-top: 0;
}

.item__cuerpo {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item__nombre {
  overflow-wrap: anywhere;
}

.item__detalle {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  overflow-wrap: anywhere;
}

.item__liberar {
  flex: none;
}
</style>
