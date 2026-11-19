<script setup lang="ts">
// Para llevar (/hostess/para-llevar): la hostess recibe el pedido de una plataforma (Didi, Rappi, Uber Eats…) o por teléfono
// y lo asigna a una mesa virtual de «Para llevar». El mesero la ve ocupada en su Panel de mesas y le toma el pedido. Aquí
// se ven los pedidos para llevar abiertos (mesa virtual, canal, referencia y si el mesero ya tomó el pedido) y se puede
// liberar uno abierto por error mientras no tenga productos. La hostess no ve pedidos ni cuentas.
import { onMounted, ref } from 'vue'
import IndicadorActualizacion from '../../components/IndicadorActualizacion.vue'
import NuevoParaLlevarDialog from '../../components/NuevoParaLlevarDialog.vue'
import { usePolling } from '../../composables/usePolling'
import { ErrorServicio } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useParaLlevarStore } from '../../stores/paraLlevar'
import type { AperturaParaLlevar, Mesa } from '../../types'
import { formatearPedidosActivos } from '../../utils/formato'

const store = useParaLlevarStore()
const anuncios = useAnunciosStore()

const { iniciar, ejecutarAhora } = usePolling(() => store.cargar())
onMounted(iniciar)

const dialogo = ref(false)
const origenDialogo = ref<HTMLElement | null>(null)
const liberando = ref(false)
const aviso = ref('')

function nuevo(e: Event) {
  origenDialogo.value = e.currentTarget as HTMLElement
  aviso.value = ''
  dialogo.value = true
}

async function alAbrir(apertura: AperturaParaLlevar) {
  dialogo.value = false
  void anuncios.anunciar(`Pedido para llevar asignado a la mesa ${apertura.numero} · ${apertura.canal}. El mesero lo toma desde Mesas.`)
  await store.invalidar()
}

async function liberar(mesa: Mesa) {
  if (liberando.value) return
  liberando.value = true
  aviso.value = ''
  try {
    await store.liberar(mesa.idMesa)
    void anuncios.anunciar(`Mesa para llevar ${mesa.numero} liberada`)
  } catch (e) {
    aviso.value = e instanceof ErrorServicio ? e.message : 'No se pudo liberar la mesa para llevar.'
  } finally {
    liberando.value = false
  }
}
</script>

<template>
  <section class="pantalla" :aria-busy="store.cargando">
    <header class="pantalla__encabezado">
      <h2>Para llevar</h2>
      <IndicadorActualizacion :ultima="store.ultimaActualizacion" :actualizando="store.actualizando" @actualizar="ejecutarAhora()" />
    </header>

    <div class="barra">
      <p class="barra__ayuda">
        Cuando llega un pedido de Didi, Rappi, Uber Eats o por teléfono, regístralo aquí: se le asigna una mesa virtual y el
        mesero la ve ocupada en su panel para tomar el pedido.
      </p>
      <button type="button" class="btn barra__nuevo" aria-haspopup="dialog" @click="nuevo">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Nuevo pedido
      </button>
    </div>

    <div v-if="store.error && store.pedidos.length > 0" class="aviso aviso--error" role="alert">
      <p>No se pudo actualizar. Se muestran los últimos datos recibidos. {{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="ejecutarAhora()">Reintentar</button>
    </div>
    <p v-if="aviso" class="aviso aviso--error" role="alert">{{ aviso }}</p>

    <div v-if="store.cargando" class="lista" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="esqueleto" />
    </div>
    <p v-if="store.cargando" class="solo-lectores" role="status">Cargando pedidos para llevar…</p>

    <div v-else-if="store.error && store.pedidos.length === 0" class="vacio" role="alert">
      <h3>No se pudieron cargar los pedidos para llevar</h3>
      <p>{{ store.error }}</p>
      <button type="button" class="btn" :disabled="store.actualizando" @click="ejecutarAhora()">Reintentar</button>
    </div>

    <div v-else-if="store.pedidos.length === 0" class="vacio">
      <h3>No hay pedidos para llevar abiertos</h3>
      <p>Cuando registres uno aparecerá aquí.</p>
    </div>

    <ul v-else class="lista" aria-label="Pedidos para llevar abiertos">
      <li v-for="m in store.pedidos" :key="m.idMesa" class="pedido tarjeta">
        <div class="pedido__mesa">
          <span class="pedido__etiqueta">Mesa</span>
          <strong class="pedido__numero numero">{{ m.numero }}</strong>
        </div>
        <div class="pedido__datos">
          <strong class="pedido__canal">{{ m.canal ?? 'Sin canal' }}</strong>
          <span v-if="m.referencia" class="pedido__detalle">{{ m.referencia }}</span>
          <span class="pedido__estado" :class="{ 'pedido__estado--espera': m.pedidosActivos === 0 }">
            {{ m.pedidosActivos === 0 ? 'Esperando que el mesero tome el pedido' : formatearPedidosActivos(m.pedidosActivos) }}
          </span>
        </div>
        <button
          v-if="m.pedidosActivos === 0"
          type="button"
          class="btn btn--secundario"
          :aria-label="`Liberar la mesa para llevar ${m.numero}`"
          :disabled="liberando"
          @click="liberar(m)"
        >
          Liberar
        </button>
      </li>
    </ul>

    <NuevoParaLlevarDialog :abierto="dialogo" :origen-foco="origenDialogo" @cerrar="dialogo = false" @abierto="alAbrir" />
  </section>
</template>

<style scoped>
.pantalla {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
  max-width: 64rem;
}

.pantalla__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-4);
}

.barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espacio-3) var(--espacio-4);
}

.barra__ayuda {
  flex: 1 1 24rem;
  margin: 0;
  color: var(--color-muted);
}

.barra__nuevo {
  flex: none;
}

.lista {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.esqueleto {
  min-height: 84px;
}

.pedido {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-4);
  padding: var(--espacio-4) var(--espacio-5);
}

.pedido__mesa {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  min-width: 4.5rem;
  line-height: 1;
}

.pedido__etiqueta {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pedido__numero {
  font-size: 2.25rem;
  color: var(--color-ocupada-texto, var(--color-primary-dark));
}

.pedido__datos {
  display: flex;
  flex: 1 1 14rem;
  flex-direction: column;
  gap: var(--espacio-1);
  min-width: 0;
}

.pedido__canal {
  font-size: var(--texto-lg);
}

.pedido__detalle,
.pedido__estado {
  overflow-wrap: anywhere;
  color: var(--color-muted);
}

.pedido__estado--espera {
  color: var(--color-peligro-texto);
  font-weight: 650;
}

@media (max-width: 40em) {
  .pedido > .btn {
    width: 100%;
  }
}
</style>
