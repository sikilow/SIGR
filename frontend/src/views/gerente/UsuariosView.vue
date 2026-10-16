<script setup lang="ts">
// Usuarios (/gerente/usuarios): consultar, crear, editar, cambiar contraseña y desactivar/reactivar.
// Los usuarios no se borran (tienen pedidos y ventas ligados): se desactivan y dejan de poder entrar.
import { computed, onMounted, ref } from 'vue'
import ConfirmarAccionDialog from '../../components/ConfirmarAccionDialog.vue'
import ContrasenaUsuarioDialog from '../../components/ContrasenaUsuarioDialog.vue'
import FormularioUsuarioDialog from '../../components/FormularioUsuarioDialog.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'
import { ErrorServicio, servicios } from '../../services'
import { useAnunciosStore } from '../../stores/anuncios'
import { useSesionStore } from '../../stores/sesion'
import { ETIQUETA_ROL, type Rol, type UsuarioAdmin } from '../../types'

const sesion = useSesionStore()
const anuncios = useAnunciosStore()

const usuarios = ref<UsuarioAdmin[]>([])
const cargando = ref(true)
const error = ref('')

type Filtro = 'todos' | 'activos' | 'inactivos'
const filtro = ref<Filtro>('activos')
const rolFiltro = ref<Rol | 'todos'>('todos')
const busqueda = ref('')

const lista = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return usuarios.value.filter((u) => {
    if (filtro.value === 'activos' && !u.activo) return false
    if (filtro.value === 'inactivos' && u.activo) return false
    if (rolFiltro.value !== 'todos' && u.rol !== rolFiltro.value) return false
    if (q && !`${u.nombre} ${u.nombreUsuario} ${u.correo}`.toLowerCase().includes(q)) return false
    return true
  })
})

const cuenta = computed(() => ({
  todos: usuarios.value.length,
  activos: usuarios.value.filter((u) => u.activo).length,
  inactivos: usuarios.value.filter((u) => !u.activo).length,
}))

async function cargar(conEsqueleto = false) {
  if (conEsqueleto) cargando.value = true
  try {
    usuarios.value = await servicios.usuarios.listar()
    error.value = ''
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudieron cargar los usuarios.'
  } finally {
    cargando.value = false
  }
}

onMounted(() => void cargar(true))

// ---------- Crear / editar ----------
const formAbierto = ref(false)
const usuarioEnEdicion = ref<UsuarioAdmin | null>(null)
const origenForm = ref<HTMLElement | null>(null)

function abrirNuevo(e: Event) {
  usuarioEnEdicion.value = null
  origenForm.value = e.currentTarget as HTMLElement
  formAbierto.value = true
}

function abrirEdicion(u: UsuarioAdmin, e: Event) {
  usuarioEnEdicion.value = u
  origenForm.value = e.currentTarget as HTMLElement
  formAbierto.value = true
}

async function alGuardar(u: UsuarioAdmin, creado: boolean) {
  formAbierto.value = false
  void anuncios.anunciar(creado ? `Usuario ${u.nombre} creado` : `Cambios de ${u.nombre} guardados`)
  await cargar()
}

// ---------- Contraseña ----------
const pwAbierto = ref(false)
const usuarioPw = ref<UsuarioAdmin | null>(null)
const origenPw = ref<HTMLElement | null>(null)

function abrirContrasena(u: UsuarioAdmin, e: Event) {
  usuarioPw.value = u
  origenPw.value = e.currentTarget as HTMLElement
  pwAbierto.value = true
}

function alCambiarContrasena(u: UsuarioAdmin) {
  pwAbierto.value = false
  void anuncios.anunciar(`Contraseña de ${u.nombre} cambiada`)
}

// ---------- Activar / desactivar ----------
const objetivo = ref<UsuarioAdmin | null>(null)
const origenConfirmar = ref<HTMLElement | null>(null)
const enCurso = ref(false)
const errorReintentable = ref('')
const rechazo = ref('')

function pedirCambioEstado(u: UsuarioAdmin, e: Event) {
  objetivo.value = u
  origenConfirmar.value = e.currentTarget as HTMLElement
  enCurso.value = false
  errorReintentable.value = ''
  rechazo.value = ''
}

async function confirmarCambioEstado() {
  const u = objetivo.value
  if (!u || enCurso.value) return
  enCurso.value = true
  errorReintentable.value = ''
  try {
    const nuevo = await servicios.usuarios.actualizar(u.idUsuario, { activo: !u.activo })
    objetivo.value = null
    void anuncios.anunciar(nuevo.activo ? `${nuevo.nombre} reactivado` : `${nuevo.nombre} desactivado`)
    await cargar()
  } catch (e) {
    if (e instanceof ErrorServicio && e.codigo === 'red') {
      errorReintentable.value = 'No se pudo conectar con el servidor. Vuelve a intentarlo.'
    } else {
      rechazo.value = e instanceof ErrorServicio ? e.message : 'Ocurrió un error inesperado.'
      void cargar()
    }
  } finally {
    enCurso.value = false
  }
}

const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca'

const FILTROS: Array<{ clave: Filtro; texto: string }> = [
  { clave: 'activos', texto: 'Activos' },
  { clave: 'inactivos', texto: 'Inactivos' },
  { clave: 'todos', texto: 'Todos' },
]
const ROLES_FILTRO: Array<Rol | 'todos'> = ['todos', 'gerente', 'mesero', 'cocinero', 'cajero', 'hostess']
</script>

<template>
  <section class="pantalla" aria-labelledby="usuarios-titulo">
    <header class="pantalla__cabecera">
      <h2 id="usuarios-titulo">Usuarios</h2>
      <button type="button" class="btn" @click="abrirNuevo">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nuevo usuario
      </button>
    </header>

    <div class="filtros">
      <div class="filtros__chips" role="group" aria-label="Estado">
        <button
          v-for="f in FILTROS"
          :key="f.clave"
          type="button"
          class="chip"
          :class="{ 'chip--activo': filtro === f.clave }"
          :aria-pressed="filtro === f.clave"
          @click="filtro = f.clave"
        >
          {{ f.texto }} <span class="numero">({{ cuenta[f.clave] }})</span>
        </button>
      </div>
      <div class="filtros__campos">
        <div class="campo">
          <label for="usr-buscar">Buscar</label>
          <input id="usr-buscar" v-model="busqueda" type="search" placeholder="Nombre, usuario o correo" autocomplete="off" />
        </div>
        <div class="campo">
          <label for="usr-filtro-rol">Rol</label>
          <select id="usr-filtro-rol" v-model="rolFiltro">
            <option v-for="r in ROLES_FILTRO" :key="r" :value="r">{{ r === 'todos' ? 'Todos los roles' : ETIQUETA_ROL[r] }}</option>
          </select>
        </div>
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
      <p class="solo-lectores" role="status">Cargando usuarios…</p>
    </div>

    <div v-else-if="!error && lista.length === 0" class="vacio">
      <p v-if="usuarios.length === 0">Todavía no hay usuarios.</p>
      <p v-else>Ningún usuario coincide con los filtros.</p>
    </div>

    <ul v-else class="lista">
      <li v-for="u in lista" :key="u.idUsuario" class="fila tarjeta" :class="{ 'fila--inactiva': !u.activo }">
        <div class="fila__datos">
          <h3>{{ u.nombre }} <span v-if="u.idUsuario === sesion.usuario?.idUsuario" class="fila__tu">(tú)</span></h3>
          <p class="fila__linea">
            <span class="fila__rol">{{ ETIQUETA_ROL[u.rol] }}</span>
            · usuario <strong>{{ u.nombreUsuario }}</strong>
          </p>
          <p class="fila__linea">{{ u.correo }}<template v-if="u.telefono"> · {{ u.telefono }}</template></p>
          <p class="fila__linea fila__meta">Último acceso: {{ fechaCorta(u.ultimoAcceso) }}</p>
        </div>

        <div class="fila__lado">
          <InsigniaEstado :tono="u.activo ? 'disponible' : 'cancelado'" :texto="u.activo ? 'Activo' : 'Inactivo'" />
          <div class="fila__acciones">
            <button type="button" class="btn btn--secundario" :aria-label="`Editar a ${u.nombre}`" @click="abrirEdicion(u, $event)">Editar</button>
            <button type="button" class="btn btn--secundario" :aria-label="`Cambiar contraseña de ${u.nombre}`" @click="abrirContrasena(u, $event)">Contraseña</button>
            <button
              v-if="u.activo"
              type="button"
              class="btn btn--peligro-suave"
              :aria-label="`Desactivar a ${u.nombre}`"
              :aria-disabled="u.idUsuario === sesion.usuario?.idUsuario ? 'true' : undefined"
              :title="u.idUsuario === sesion.usuario?.idUsuario ? 'No puedes desactivarte a ti mismo' : undefined"
              @click="u.idUsuario !== sesion.usuario?.idUsuario && pedirCambioEstado(u, $event)"
            >
              Desactivar
            </button>
            <button v-else type="button" class="btn" :aria-label="`Reactivar a ${u.nombre}`" @click="pedirCambioEstado(u, $event)">Reactivar</button>
          </div>
        </div>
      </li>
    </ul>

    <FormularioUsuarioDialog
      :abierto="formAbierto"
      :usuario="usuarioEnEdicion"
      :es-yo="usuarioEnEdicion !== null && usuarioEnEdicion.idUsuario === sesion.usuario?.idUsuario"
      :origen-foco="origenForm"
      @cerrar="formAbierto = false"
      @guardado="alGuardar"
    />

    <ContrasenaUsuarioDialog :abierto="pwAbierto" :usuario="usuarioPw" :origen-foco="origenPw" @cerrar="pwAbierto = false" @cambiada="alCambiarContrasena" />

    <ConfirmarAccionDialog
      :abierto="objetivo !== null"
      id-base="estado-usuario"
      :titulo="objetivo?.activo ? `¿Desactivar a ${objetivo?.nombre}?` : `¿Reactivar a ${objetivo?.nombre}?`"
      :descripcion="
        objetivo?.activo
          ? 'Ya no podrá iniciar sesión. Su historial (pedidos, ventas) se conserva y puedes reactivarlo cuando quieras. Si tiene una sesión abierta, puede seguir usándola hasta que venza (máximo 8 horas).'
          : 'Podrá volver a iniciar sesión con su usuario y contraseña de siempre.'
      "
      :texto-confirmar="objetivo?.activo ? 'Desactivar' : 'Reactivar'"
      :en-curso="enCurso"
      :error-reintentable="errorReintentable"
      :rechazo="rechazo"
      :origen-foco="origenConfirmar"
      @confirmar="confirmarCambioEstado"
      @cerrar="objetivo = null"
    />
  </section>
</template>

<style scoped>
.pantalla { display: flex; flex-direction: column; gap: var(--espacio-4); max-width: 1000px; margin: 0 auto; }
.pantalla__cabecera { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--espacio-3); }
.filtros { display: flex; flex-direction: column; gap: var(--espacio-3); }
.filtros__chips { display: flex; flex-wrap: wrap; gap: var(--espacio-2); }
.filtros__campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--espacio-3); }
.campo select { min-height: var(--tactil-min); padding: 0 var(--espacio-4); border: 2px solid var(--color-muted); border-radius: var(--radio-sm); background: var(--color-surface); font-weight: 400; }
.campo input[type='search'] { min-height: var(--tactil-min); }

.lista { display: flex; flex-direction: column; gap: var(--espacio-3); margin: 0; padding: 0; list-style: none; }
.fila { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--espacio-4); padding: var(--espacio-4) var(--espacio-5); }
.fila--inactiva { background: var(--color-bg); }
.fila--inactiva .fila__datos { opacity: 0.85; }
.fila__datos { flex: 1 1 280px; min-width: 0; }
.fila__datos h3 { overflow-wrap: anywhere; }
.fila__tu { color: var(--color-muted); font-size: var(--texto-base); font-weight: 400; }
.fila__linea { margin: var(--espacio-1) 0 0; overflow-wrap: anywhere; }
.fila__rol { font-weight: 700; color: var(--color-primary-dark); }
.fila__meta { color: var(--color-muted); font-size: var(--texto-sm); }
.fila__lado { display: flex; flex: 0 1 auto; flex-direction: column; align-items: flex-end; gap: var(--espacio-3); }
.fila__acciones { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--espacio-2); }

@media (max-width: 40em) {
  .fila__lado { align-items: stretch; width: 100%; }
  .fila__acciones { justify-content: stretch; }
  .fila__acciones .btn { flex: 1 1 140px; }
}
</style>
