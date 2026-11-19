<script setup lang="ts">
// Clientes (/gerente/clientes): consultar, corregir sus datos y eliminar. «Eliminar» es lógico (solo el gerente): el
// cliente deja de aparecer en la búsqueda de la hostess y no puede entrar al portal, pero se conserva para el historial
// de reservaciones y se restaura desde «Eliminados». No se elimina con reservaciones vigentes ni en la lista de espera.
import { computed, onMounted, ref } from 'vue'
import ConfirmarAccionDialog from '../../components/ConfirmarAccionDialog.vue'
import FormularioClienteDialog from '../../components/FormularioClienteDialog.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import { ErrorServicio, servicios } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import type { ClienteAdmin } from '../../types'
import { vPermitir } from '../../utils/campos'
import { textoTelefono } from '../../utils/lada'

const anuncios = useAnunciosStore()

const clientes = ref<ClienteAdmin[]>([])
const eliminados = ref<ClienteAdmin[]>([])
const cargando = ref(true)
const error = ref('')

type Filtro = 'todos' | 'con_cuenta'
const filtro = ref<Filtro>('todos')
const verEliminados = ref(false)
const busqueda = ref('')

function elegirFiltro(clave: Filtro) {
  verEliminados.value = false
  filtro.value = clave
}

const lista = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  const digitos = q.replace(/\D/g, '')
  const base = verEliminados.value ? eliminados.value : clientes.value
  return base.filter((c) => {
    if (!verEliminados.value && filtro.value === 'con_cuenta' && !c.tieneCuenta) return false
    if (!q) return true
    return (
      c.nombre.toLowerCase().includes(q) ||
      (c.correo ?? '').toLowerCase().includes(q) ||
      (digitos.length >= 3 && (c.telefono ?? '').includes(digitos))
    )
  })
})

const cuenta = computed(() => ({
  todos: clientes.value.length,
  con_cuenta: clientes.value.filter((c) => c.tieneCuenta).length,
}))

async function cargar(conEsqueleto = false) {
  if (conEsqueleto) cargando.value = true
  try {
    const [vigentes, borrados] = await Promise.all([servicios.clientes.listar(), servicios.clientes.listar({ eliminados: true })])
    clientes.value = vigentes
    eliminados.value = borrados
    // Si ya no queda nada eliminado, se vuelve a la lista normal.
    if (borrados.length === 0) verEliminados.value = false
    error.value = ''
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar los clientes.'
  } finally {
    cargando.value = false
  }
}

onMounted(() => void cargar(true))

// ---------- Editar ----------
const formAbierto = ref(false)
const enEdicion = ref<ClienteAdmin | null>(null)
const origenForm = ref<HTMLElement | null>(null)

function abrirEdicion(c: ClienteAdmin, e: Event) {
  enEdicion.value = c
  origenForm.value = e.currentTarget as HTMLElement
  formAbierto.value = true
}

async function alGuardar(c: ClienteAdmin) {
  formAbierto.value = false
  void anuncios.anunciar(`Datos de ${c.nombre} guardados`)
  await cargar()
}

// ---------- Eliminar / restaurar ----------
const aEliminar = ref<ClienteAdmin | null>(null)
const origenEliminar = ref<HTMLElement | null>(null)
const eliminando = ref(false)
const errorEliminar = ref('')
const rechazoEliminar = ref('')

function pedirEliminar(c: ClienteAdmin, e: Event) {
  aEliminar.value = c
  origenEliminar.value = e.currentTarget as HTMLElement
  eliminando.value = false
  errorEliminar.value = ''
  rechazoEliminar.value = ''
}

async function confirmarEliminar() {
  const c = aEliminar.value
  if (!c || eliminando.value) return
  eliminando.value = true
  errorEliminar.value = ''
  try {
    await servicios.clientes.eliminar(c.idCliente)
    aEliminar.value = null
    void anuncios.anunciar(`${c.nombre} eliminado. Puedes restaurarlo desde «Eliminados»`)
    await cargar()
  } catch (e) {
    if (e instanceof ErrorServicio && e.codigo === 'red') {
      errorEliminar.value = 'No se pudo conectar con el servidor. Vuelve a intentarlo.'
    } else {
      rechazoEliminar.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
      void cargar()
    }
  } finally {
    eliminando.value = false
  }
}

async function restaurar(c: ClienteAdmin) {
  try {
    await servicios.clientes.restaurar(c.idCliente)
    void anuncios.anunciar(`${c.nombre} restaurado`)
    await cargar()
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo restaurar al cliente.'
  }
}

const fechaCorta = (d: Date | null | undefined) => (d ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

const FILTROS: Array<{ clave: Filtro; texto: string }> = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'con_cuenta', texto: 'Con cuenta en el portal' },
]
</script>

<template>
  <section class="pantalla" aria-labelledby="clientes-titulo">
    <header class="pantalla__cabecera">
      <div>
        <h2 id="clientes-titulo">Clientes</h2>
        <p class="pantalla__sub">Quienes han reservado o están en la lista de espera. La hostess los da de alta al anotarlos.</p>
      </div>
    </header>

    <div class="filtros">
      <div class="filtros__chips" role="group" aria-label="Filtro">
        <button
          v-for="f in FILTROS.filter((x) => x.clave === 'todos' || cuenta.con_cuenta > 0)"
          :key="f.clave"
          type="button"
          class="chip"
          :class="{ 'chip--activo': !verEliminados && filtro === f.clave }"
          :aria-pressed="!verEliminados && filtro === f.clave"
          @click="elegirFiltro(f.clave)"
        >
          {{ f.texto }} <span class="numero">({{ cuenta[f.clave] }})</span>
        </button>
        <button
          v-if="eliminados.length > 0"
          type="button"
          class="chip"
          :class="{ 'chip--activo': verEliminados }"
          :aria-pressed="verEliminados"
          @click="verEliminados = true"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />
          </svg>
          Eliminados <span class="numero">({{ eliminados.length }})</span>
        </button>
      </div>
      <p v-if="verEliminados" class="filtros__nota">Estos clientes no aparecen en la búsqueda de la hostess ni pueden entrar al portal. Su historial se conserva; restáuralos para volver a usarlos.</p>
      <div class="campo">
        <label for="cli-buscar">Buscar</label>
        <input id="cli-buscar" v-permitir="'busqueda'" v-model="busqueda" type="search" placeholder="Nombre, correo o teléfono" autocomplete="off" />
      </div>
    </div>

    <div v-if="error" class="aviso" role="alert">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.01" />
      </svg>
      <p>{{ error }}</p>
      <button type="button" class="btn btn--secundario" @click="cargar(true)">Reintentar</button>
    </div>

    <div v-if="cargando" class="lista" aria-busy="true">
      <div v-for="n in 4" :key="n" class="esqueleto" />
      <p class="solo-lectores" role="status">Cargando clientes…</p>
    </div>

    <div v-else-if="!error && lista.length === 0" class="vacio">
      <p v-if="clientes.length === 0 && !verEliminados">Todavía no hay clientes. Aparecen cuando la hostess los registra o se crean una cuenta en el portal.</p>
      <p v-else>Ningún cliente coincide con la búsqueda.</p>
    </div>

    <ul v-else class="lista">
      <li v-for="c in lista" :key="c.idCliente" class="fila tarjeta">
        <div class="fila__datos">
          <h3>{{ c.nombre }}</h3>
          <p class="fila__linea">{{ textoTelefono(c.telefono, c.lada) ?? 'Sin teléfono' }}</p>
          <p class="fila__linea fila__meta">{{ c.correo ?? 'Sin correo' }}</p>
          <p class="fila__linea fila__meta">
            {{ c.totalReservaciones }} {{ c.totalReservaciones === 1 ? 'reservación' : 'reservaciones' }}
            <template v-if="c.reservacionesVigentes > 0"> · <strong>{{ c.reservacionesVigentes }} vigente{{ c.reservacionesVigentes === 1 ? '' : 's' }}</strong></template>
          </p>
        </div>

        <div v-if="verEliminados" class="fila__lado">
          <InsigniaEstado tono="cancelado" :texto="`Eliminado el ${fechaCorta(c.eliminadoEn)}`" />
          <div class="fila__acciones">
            <button type="button" class="btn" :aria-label="`Restaurar a ${c.nombre}`" @click="restaurar(c)">Restaurar</button>
          </div>
        </div>

        <div v-else class="fila__lado">
          <div class="fila__insignias">
            <InsigniaEstado v-if="c.tieneCuenta" tono="activo" texto="Cuenta en el portal" />
            <InsigniaEstado v-if="c.reservacionesVigentes > 0" tono="reservada" texto="Con reservación" />
          </div>
          <div class="fila__acciones">
            <button type="button" class="btn btn--secundario" :aria-label="`Editar a ${c.nombre}`" @click="abrirEdicion(c, $event)">Editar</button>
            <button type="button" class="btn btn--peligro-suave" :aria-label="`Eliminar a ${c.nombre}`" @click="pedirEliminar(c, $event)">Eliminar</button>
          </div>
        </div>
      </li>
    </ul>

    <FormularioClienteDialog :abierto="formAbierto" :cliente="enEdicion" :origen-foco="origenForm" @cerrar="formAbierto = false" @guardado="alGuardar" />

    <ConfirmarAccionDialog
      :abierto="aEliminar !== null"
      id-base="eliminar-cliente"
      :titulo="`¿Eliminar a ${aEliminar?.nombre}?`"
      descripcion="Dejará de aparecer en la búsqueda de la hostess y, si tiene cuenta en el portal, ya no podrá entrar (su sesión se cierra de inmediato). Su historial de reservaciones se conserva y podrás restaurarlo desde «Eliminados»."
      texto-confirmar="Eliminar"
      :en-curso="eliminando"
      :error-reintentable="errorEliminar"
      :rechazo="rechazoEliminar"
      :origen-foco="origenEliminar"
      @confirmar="confirmarEliminar"
      @cerrar="aEliminar = null"
    />
  </section>
</template>

<style scoped>
.pantalla { display: flex; flex-direction: column; gap: var(--espacio-4); max-width: 1000px; margin: 0 auto; }
.pantalla__cabecera { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--espacio-3); }
.pantalla__sub { margin: var(--espacio-1) 0 0; color: var(--color-muted); }
.filtros { display: flex; flex-direction: column; gap: var(--espacio-3); }
.filtros__chips { display: flex; flex-wrap: wrap; gap: var(--espacio-2); }
.filtros__nota { margin: 0; color: var(--color-muted); font-size: var(--texto-sm); }
.campo input[type='search'] { min-height: var(--tactil-min); }

.lista { display: flex; flex-direction: column; gap: var(--espacio-3); margin: 0; padding: 0; list-style: none; }
.fila { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--espacio-4); padding: var(--espacio-4) var(--espacio-5); }
.fila__datos { flex: 1 1 280px; min-width: 0; }
.fila__datos h3 { overflow-wrap: anywhere; }
.fila__linea { margin: var(--espacio-1) 0 0; overflow-wrap: anywhere; }
.fila__meta { color: var(--color-muted); font-size: var(--texto-sm); }
.fila__lado { display: flex; flex: 0 1 auto; flex-direction: column; align-items: flex-end; gap: var(--espacio-3); }
.fila__insignias { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--espacio-2); }
.fila__acciones { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--espacio-2); }

@media (max-width: 40em) {
  .fila__lado { align-items: stretch; width: 100%; }
  .fila__insignias { justify-content: flex-start; }
  .fila__acciones { justify-content: stretch; }
  .fila__acciones .btn { flex: 1 1 140px; }
}
</style>
