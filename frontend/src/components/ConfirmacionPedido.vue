<script setup lang="ts">
// Resultado de registrar, enviar o modificar un pedido, con los datos REALES del servidor
// (número, estado y total). Ofrece los tres caminos siguientes.
import { nextTick, onMounted, ref } from 'vue'
import { ETIQUETA_ESTADO_PEDIDO, type Pedido } from '../types'
import { formatearMoneda } from '../utils/formato'
import type { ResultadoPedido } from './RevisionPedido.vue'

const props = defineProps<{
  pedido: Pedido
  resultado: ResultadoPedido
  mesaNumero: number
}>()

defineEmits<{ nuevo: [] }>()

const TITULOS: Record<ResultadoPedido, string> = {
  registrado: 'Pedido registrado',
  enviado: 'Pedido enviado a cocina',
  actualizado: 'Cambios guardados',
}

const titulo = ref<HTMLElement | null>(null)

// Al aparecer, el foco pasa al título para que el resultado se anuncie. Se espera un instante
// porque el diálogo de revisión aún se está cerrando y mientras esté abierto el resto es inerte.
onMounted(async () => {
  await nextTick()
  setTimeout(() => titulo.value?.focus(), 80)
})
</script>

<template>
  <section class="confirmacion tarjeta" aria-labelledby="confirmacion-titulo">
    <svg class="confirmacion__icono" viewBox="0 0 24 24" width="48" height="48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
    <h2 id="confirmacion-titulo" ref="titulo" tabindex="-1">{{ TITULOS[resultado] }}</h2>

    <dl class="confirmacion__datos">
      <div>
        <dt>Mesa</dt>
        <dd>{{ mesaNumero }}</dd>
      </div>
      <div>
        <dt>Pedido</dt>
        <dd class="numero">#{{ pedido.idPedido }}</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>{{ ETIQUETA_ESTADO_PEDIDO[pedido.estado] }}</dd>
      </div>
      <div>
        <dt>Total</dt>
        <dd class="numero confirmacion__total">{{ formatearMoneda(pedido.total) }}</dd>
      </div>
    </dl>

    <p v-if="props.resultado === 'registrado'" class="confirmacion__nota">
      El pedido quedó registrado y aún no se envía a cocina.
    </p>

    <ul class="confirmacion__lineas" aria-label="Productos del pedido">
      <li v-for="d in pedido.detalle" :key="d.idProducto">
        <span class="numero">{{ d.cantidad }}×</span> {{ d.nombreProducto }}
        <small v-if="d.indicaciones" class="confirmacion__obs">Obs.: {{ d.indicaciones }}</small>
      </li>
    </ul>

    <div class="fila-botones confirmacion__acciones">
      <RouterLink class="btn" :to="{ name: 'mesero-mesas' }">Volver al panel</RouterLink>
      <button type="button" class="btn btn--secundario" @click="$emit('nuevo')">Nuevo pedido en esta mesa</button>
      <RouterLink class="btn btn--secundario" :to="{ name: 'mesero-cuenta-mesa', params: { idMesa: pedido.idMesa } }">
        Ver cuenta
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.confirmacion {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--espacio-4);
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
}

.confirmacion__icono {
  color: var(--color-libre);
}

.confirmacion h2:focus {
  outline: none;
}

.confirmacion__datos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--espacio-3);
  width: 100%;
  margin: 0;
}

.confirmacion__datos dt {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.confirmacion__datos dd {
  margin: 0;
  font-size: var(--texto-lg);
  font-weight: 700;
}

.confirmacion__total {
  color: var(--color-primary-dark);
}

.confirmacion__nota {
  margin: 0;
  color: var(--color-muted);
}

.confirmacion__lineas {
  width: 100%;
  margin: 0;
  padding: var(--espacio-3) 0 0;
  border-top: 1px solid var(--color-border);
  list-style: none;
  text-align: left;
}

.confirmacion__lineas li {
  padding: var(--espacio-1) 0;
}

.confirmacion__obs {
  display: block;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}

.confirmacion__acciones {
  justify-content: center;
  width: 100%;
}
</style>
