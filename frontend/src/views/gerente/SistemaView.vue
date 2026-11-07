<script setup lang="ts">
// Página de referencia del sistema de diseño (solo gerencia): muestra la paleta, la tipografía,
// los controles, los avisos, los estados y el ticket de 80 mm tal como se usan en la aplicación.
import { ref } from 'vue'
import type { TonoEstado } from '../../components/IconoEstado.vue'
import InsigniaEstado from '../../components/InsigniaEstado.vue'

interface Muestra {
  nombre: string
  token: string
  hex: string
  uso: string
  claro: boolean
}

const paleta: Muestra[] = [
  { nombre: 'Barro cocido', token: '--color-primary', hex: '#A63A1F', uso: 'Acción principal y marca.', claro: true },
  { nombre: 'Barro profundo', token: '--color-primary-dark', hex: '#7A2A16', uso: 'Texto de marca y foco.', claro: true },
  { nombre: 'Agave', token: '--color-secondary', hex: '#2E6B58', uso: 'Disponibilidad y calma.', claro: true },
  { nombre: 'Maíz', token: '--color-maiz', hex: '#C58A24', uso: 'Atención y pendientes.', claro: false },
  { nombre: 'Papel cálido', token: '--color-bg', hex: '#F7F0E5', uso: 'Fondo general.', claro: false },
  { nombre: 'Superficie', token: '--color-surface', hex: '#FFFCF7', uso: 'Tarjetas y hojas.', claro: false },
  { nombre: 'Tinta', token: '--color-text', hex: '#1E241F', uso: 'Texto principal.', claro: true },
  { nombre: 'Borde', token: '--color-border', hex: '#D9CBB8', uso: 'Divisiones suaves.', claro: false },
  { nombre: 'Peligro', token: '--color-peligro', hex: '#A42222', uso: 'Cancelar y errores.', claro: true },
  { nombre: 'Éxito', token: '--color-exito', hex: '#2E6B45', uso: 'Confirmación.', claro: true },
  { nombre: 'Información', token: '--color-info', hex: '#2B5F8C', uso: 'Avisos neutrales.', claro: true },
  { nombre: 'Advertencia', token: '--color-advertencia', hex: '#8A5200', uso: 'Revisar antes de seguir.', claro: true },
]

interface GrupoEstado {
  titulo: string
  estados: Array<{ tono: TonoEstado; texto: string }>
}

const gruposEstados: GrupoEstado[] = [
  {
    titulo: 'Mesa',
    estados: [
      { tono: 'libre', texto: 'Libre' },
      { tono: 'ocupada', texto: 'Ocupada' },
      { tono: 'reservada', texto: 'Reservada' },
    ],
  },
  {
    titulo: 'Pedido',
    estados: [
      { tono: 'registrado', texto: 'Registrado' },
      { tono: 'enviado', texto: 'Enviado a cocina' },
      { tono: 'en_preparacion', texto: 'En preparación' },
      { tono: 'listo', texto: 'Listo para entregar' },
      { tono: 'entregado', texto: 'Entregado' },
      { tono: 'cancelado', texto: 'Cancelado' },
    ],
  },
  {
    titulo: 'Cuenta',
    estados: [
      { tono: 'cuenta_abierta', texto: 'Abierta' },
      { tono: 'cuenta_por_pagar', texto: 'Por pagar' },
      { tono: 'cuenta_pagada', texto: 'Pagada' },
    ],
  },
  {
    titulo: 'Producto',
    estados: [
      { tono: 'producto_disponible', texto: 'Disponible' },
      { tono: 'producto_stock_bajo', texto: 'Stock bajo' },
      { tono: 'producto_agotado', texto: 'Agotado' },
    ],
  },
]

const usuario = ref('')
const seccion = ref('terraza')
const nota = ref('')
const disponible = ref(true)
const urgente = ref(true)

const lineasTicket = [
  { cantidad: 2, producto: 'Tacos al pastor', importe: 240 },
  { cantidad: 1, producto: 'Guacamole con totopos', importe: 95 },
  { cantidad: 2, producto: 'Agua de horchata', importe: 110 },
]

const moneda = (cantidad: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cantidad)
</script>

<template>
  <section class="sistema pagina">
    <header class="pagina__encabezado">
      <div>
        <p class="sobretitulo">Identidad · La Madalena</p>
        <h2>Sistema de diseño</h2>
        <p>Las piezas que dan forma a SIGR: color, tipografía, controles y estados.</p>
      </div>
      <span class="sistema__version">SIGR · Edición 2026</span>
    </header>

    <!-- Portada editorial: resume el carácter de la marca -->
    <section class="portada" aria-labelledby="portada-titulo">
      <div class="portada__texto">
        <p class="portada__linea">Cocina mexicana contemporánea</p>
        <h3 id="portada-titulo">Barro, agave<br />y maíz.</h3>
        <p class="portada__descripcion">
          Una identidad cálida y directa, pensada para el ritmo del salón: se lee de lejos, se toca sin dudar
          y nunca depende solo del color.
        </p>
        <ul class="portada__principios">
          <li>Claridad antes que adorno</li>
          <li>Tacto generoso</li>
          <li>Estado siempre legible</li>
        </ul>
      </div>
      <div class="portada__sello" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="60" cy="60" r="52" />
          <path d="M60 26v68M26 60h68M36 36c8 9 16 14 24 14s16-5 24-14M36 84c8-9 16-14 24-14s16 5 24 14" />
        </svg>
        <span>Hecho con oficio</span>
      </div>
    </section>

    <!-- 01 · Color -->
    <section class="seccion" aria-labelledby="color-titulo">
      <header class="seccion__encabezado">
        <p class="sobretitulo">01 · Color</p>
        <h3 id="color-titulo">Una paleta con oficio</h3>
        <p>El barro es la acción; el agave, la disponibilidad; el maíz, lo que pide atención.</p>
      </header>

      <ul class="paleta">
        <li v-for="muestra in paleta" :key="muestra.token" class="muestra">
          <div
            class="muestra__color"
            :class="{ 'muestra__color--claro': muestra.claro }"
            :style="{ background: `var(${muestra.token})` }"
          >
            <span class="muestra__hex">{{ muestra.hex }}</span>
          </div>
          <div class="muestra__datos">
            <strong>{{ muestra.nombre }}</strong>
            <code>{{ muestra.token }}</code>
            <span>{{ muestra.uso }}</span>
          </div>
        </li>
      </ul>
    </section>

    <!-- 02 · Tipografía -->
    <section class="seccion" aria-labelledby="tipo-titulo">
      <header class="seccion__encabezado">
        <p class="sobretitulo">02 · Tipografía</p>
        <h3 id="tipo-titulo">Editorial para leer, clara para trabajar</h3>
        <p>Fraunces da carácter a los títulos; Instrument Sans mantiene la interfaz precisa.</p>
      </header>

      <div class="tipo">
        <div class="tipo__muestra">
          <span class="tipo__aa">Aa</span>
          <div>
            <strong>Fraunces</strong>
            <p>Títulos y momentos de marca. Serif cálida, con contraste y aire editorial.</p>
          </div>
        </div>
        <div class="tipo__muestra tipo__muestra--ui">
          <span class="tipo__aa">Aa</span>
          <div>
            <strong>Instrument Sans</strong>
            <p>Interfaz, cuerpo y cifras. Neutra, compacta y legible a cualquier tamaño.</p>
          </div>
        </div>
      </div>

      <dl class="escala">
        <div class="escala__fila">
          <dt>Display · 44 px</dt>
          <dd class="escala__display">Mesa lista</dd>
        </div>
        <div class="escala__fila">
          <dt>Título · 24 px</dt>
          <dd class="escala__titulo">Corte de caja</dd>
        </div>
        <div class="escala__fila">
          <dt>Cuerpo · 16 px</dt>
          <dd class="escala__cuerpo">Los pedidos más antiguos aparecen primero. Al marcarlos listos, el mesero podrá entregarlos.</dd>
        </div>
        <div class="escala__fila">
          <dt>Apoyo · 14 px</dt>
          <dd class="escala__apoyo">Abierto desde hoy, 13:20 · 4 pedidos en curso</dd>
        </div>
        <div class="escala__fila">
          <dt>Cifras</dt>
          <dd class="escala__cifras numero">$1,485.00 · Mesa 12 · 20:45</dd>
        </div>
      </dl>
    </section>

    <!-- 03 · Controles -->
    <section class="seccion" aria-labelledby="controles-titulo">
      <header class="seccion__encabezado">
        <p class="sobretitulo">03 · Controles</p>
        <h3 id="controles-titulo">Acciones sin ambigüedad</h3>
        <p>Un primario por decisión. Todo control mide al menos 48 px y responde al tacto.</p>
      </header>

      <div class="demostracion">
        <div class="demostracion__fila">
          <button type="button" class="btn">Guardar cambios</button>
          <button type="button" class="btn btn--secundario">Cancelar</button>
          <button type="button" class="btn btn--texto">Ver detalle</button>
          <button type="button" class="btn btn--icono" aria-label="Actualizar">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
            </svg>
          </button>
          <button type="button" class="btn btn--peligro">Cancelar pedido</button>
          <button type="button" class="btn" disabled>No disponible</button>
        </div>

        <div class="demostracion__fila demostracion__fila--chips" role="group" aria-label="Filtros de ejemplo">
          <button type="button" class="chip chip--activo" aria-pressed="true">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="m5 12 5 5 9-10" />
            </svg>
            Todos
          </button>
          <button type="button" class="chip" aria-pressed="false">Entradas</button>
          <button type="button" class="chip" aria-pressed="false">Fuertes</button>
          <button type="button" class="chip" aria-pressed="false">Postres</button>
          <button type="button" class="chip" aria-pressed="false">Bebidas</button>
        </div>
      </div>
    </section>

    <!-- 04 · Formularios y avisos -->
    <section class="seccion" aria-labelledby="formularios-titulo">
      <header class="seccion__encabezado">
        <p class="sobretitulo">04 · Formularios y avisos</p>
        <h3 id="formularios-titulo">Decir qué pasa, sin adornos</h3>
        <p>Etiqueta visible, ayuda breve y un mensaje que explica cómo seguir.</p>
      </header>

      <div class="duo">
        <form class="panel formulario" @submit.prevent>
          <h4>Datos de la reservación</h4>

          <div class="campo">
            <label for="demo-usuario">Nombre del cliente</label>
            <input id="demo-usuario" v-model="usuario" type="text" placeholder="Ej. María López" autocomplete="off" />
            <p class="campo__ayuda">Como aparecerá en la lista de espera.</p>
          </div>

          <div class="campo">
            <label for="demo-seccion">Sección preferida</label>
            <select id="demo-seccion" v-model="seccion">
              <option value="terraza">Terraza</option>
              <option value="salon">Salón</option>
              <option value="barra">Barra</option>
            </select>
          </div>

          <div class="campo">
            <label for="demo-nota">Nota para el equipo</label>
            <textarea id="demo-nota" v-model="nota" rows="3" placeholder="Cumpleaños, alergias, movilidad…" />
          </div>

          <label class="interruptor">
            <input v-model="disponible" type="checkbox" />
            <span>Mesa disponible para asignar</span>
          </label>
        </form>

        <div class="avisos-demo">
          <div class="aviso aviso--error" role="alert">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6M12 16.5v.01" />
            </svg>
            <p>No se pudo guardar. Revisa la conexión e inténtalo de nuevo.</p>
          </div>

          <div class="aviso aviso--info" role="status">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8v.01" />
            </svg>
            <p>La cuenta está abierta desde las 19:40. Aún puedes agregar pedidos.</p>
          </div>

          <div class="aviso aviso--exito" role="status">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="m8 12 3 3 5-6" />
            </svg>
            <p>Reservación confirmada. El cliente recibió el correo.</p>
          </div>

          <div class="aviso aviso--advertencia" role="status">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3 2.8 19h18.4L12 3Z" />
              <path d="M12 9v4M12 16v.01" />
            </svg>
            <p>La mesa tiene capacidad para 4 personas y la reservación es para 6.</p>
          </div>

          <label class="interruptor">
            <input v-model="urgente" type="checkbox" />
            <span>Avisar al mesero cuando el pedido lleve 20 minutos</span>
          </label>
        </div>
      </div>
    </section>

    <!-- 05 · Estados -->
    <section class="seccion" aria-labelledby="estados-titulo">
      <header class="seccion__encabezado">
        <p class="sobretitulo">05 · Estados</p>
        <h3 id="estados-titulo">Siempre ícono y texto</h3>
        <p>El color acompaña; nunca es la única señal. Cada estado conserva su propia voz.</p>
      </header>

      <div class="estados">
        <div v-for="grupo in gruposEstados" :key="grupo.titulo" class="estados__grupo panel">
          <h4>{{ grupo.titulo }}</h4>
          <ul>
            <li v-for="estado in grupo.estados" :key="estado.tono">
              <InsigniaEstado :tono="estado.tono" :texto="estado.texto" ajustar />
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 06 · Ritmo y comprobante -->
    <section class="seccion" aria-labelledby="ritmo-titulo">
      <header class="seccion__encabezado">
        <p class="sobretitulo">06 · Ritmo y comprobante</p>
        <h3 id="ritmo-titulo">El tiempo también se ve</h3>
        <p>En cocina la urgencia se vuelve borde y cifra. En caja, el ticket sale en 80 mm.</p>
      </header>

      <div class="duo duo--ritmo">
        <div class="ritmo panel">
          <h4>Urgencia en cocina</h4>
          <ul class="ritmo__lista">
            <li class="ritmo__item ritmo__item--normal">
              <span class="ritmo__tiempo numero">04<span>min</span></span>
              <span class="ritmo__texto"><strong>Normal</strong><span>Menos de 10 minutos. Sin alarma.</span></span>
            </li>
            <li class="ritmo__item ritmo__item--atencion">
              <span class="ritmo__tiempo numero">14<span>min</span></span>
              <span class="ritmo__texto"><strong>Atención</strong><span>De 10 a 19 minutos. Revisar el fuego.</span></span>
            </li>
            <li class="ritmo__item ritmo__item--urgente">
              <span class="ritmo__tiempo numero">23<span>min</span></span>
              <span class="ritmo__texto"><strong>Urgente</strong><span>20 minutos o más. Sale primero.</span></span>
            </li>
          </ul>
          <p class="ritmo__nota">Los tiempos se recalculan cada 30 segundos y no dependen del color para entenderse.</p>
        </div>

        <div class="ticket-preview">
          <div class="ticket">
            <div class="ticket__marca">
              <strong>La Madalena</strong>
              <span>SIGR · Comprobante de venta</span>
            </div>

            <dl class="ticket__datos">
              <div><dt>Ticket</dt><dd>#1042</dd></div>
              <div><dt>Mesa</dt><dd>12</dd></div>
              <div><dt>Mesero</dt><dd>Ana Ruiz</dd></div>
              <div><dt>Fecha</dt><dd>26/10/2026 · 20:45</dd></div>
            </dl>

            <table class="ticket__tabla">
              <thead>
                <tr><th scope="col">Cant</th><th scope="col">Producto</th><th scope="col">Importe</th></tr>
              </thead>
              <tbody>
                <tr v-for="linea in lineasTicket" :key="linea.producto">
                  <td class="numero">{{ linea.cantidad }}</td>
                  <td>{{ linea.producto }}</td>
                  <td class="numero">{{ moneda(linea.importe) }}</td>
                </tr>
              </tbody>
            </table>

            <p class="ticket__total"><span>Total</span><strong class="numero">$445.00</strong></p>
            <ul class="ticket__pagos">
              <li><span>Efectivo</span><span class="numero">$500.00</span></li>
            </ul>
            <p class="ticket__cambio"><span>Cambio</span><strong class="numero">$55.00</strong></p>

            <p class="ticket__gracias">¡Gracias por su visita!</p>
            <p class="ticket__nota">Conserve este comprobante.</p>
          </div>
          <p class="ticket-preview__nota">Ancho 80 mm · impresión térmica · solo se imprime el ticket</p>
        </div>
      </div>
    </section>

    <footer class="sistema__pie">
      <p>La Madalena · Sistema Integral de Gestión de Restaurante</p>
      <p>Las reglas de negocio viven en el backend; aquí solo se muestran sus formas.</p>
    </footer>
  </section>
</template>

<style scoped>
.sistema {
  max-width: 1120px;
}

.sistema h2 {
  font-size: clamp(2rem, 1.4rem + 2.4vw, 3rem);
}

.sistema__version {
  flex: none;
  padding: var(--espacio-2) var(--espacio-4);
  border: 2px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
}

/* ---------- Portada ---------- */
.portada {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(12rem, 0.6fr);
  align-items: center;
  gap: var(--espacio-8);
  overflow: hidden;
  padding: clamp(var(--espacio-6), 4vw, var(--espacio-12));
  border-radius: var(--radio-lg);
  background:
    radial-gradient(circle at 82% 20%, rgb(197 138 36 / 22%), transparent 42%),
    linear-gradient(140deg, #8f2f18 0%, var(--color-primary) 48%, #7a2a16 100%);
  color: var(--color-on-primary);
  box-shadow: var(--sombra-elevada);
}

.portada::after {
  content: '';
  position: absolute;
  inset: auto -18% -55% 42%;
  height: 130%;
  border: 2px solid rgb(255 249 243 / 16%);
  border-radius: 50%;
  pointer-events: none;
}

.portada__linea {
  margin: 0;
  color: #f4d6a4;
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.portada h3 {
  margin: var(--espacio-3) 0 0;
  color: var(--color-on-primary);
  font-family: var(--fuente-titulo);
  font-size: clamp(3rem, 2rem + 5vw, 5.2rem);
  font-weight: 600;
  line-height: 0.92;
  letter-spacing: -0.045em;
}

.portada__descripcion {
  max-width: 36ch;
  margin: var(--espacio-5) 0 0;
  color: rgb(255 249 243 / 88%);
  font-size: var(--texto-lg);
  line-height: 1.45;
}

.portada__principios {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
  margin: var(--espacio-6) 0 0;
  padding: 0;
  list-style: none;
}

.portada__principios li {
  padding: var(--espacio-1) var(--espacio-3);
  border: 1px solid rgb(255 249 243 / 38%);
  border-radius: 999px;
  color: var(--color-on-primary);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.portada__sello {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--espacio-3);
  color: #f4d6a4;
  text-align: center;
}

.portada__sello span {
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* ---------- Secciones ---------- */
.seccion {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-5);
}

.seccion__encabezado {
  max-width: 62ch;
}

.seccion__encabezado h3 {
  margin: var(--espacio-1) 0 0;
  font-family: var(--fuente-titulo);
  font-size: var(--texto-2xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.seccion__encabezado p:last-child {
  margin: var(--espacio-2) 0 0;
  color: var(--color-muted);
}

/* ---------- Paleta ---------- */
.paleta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--espacio-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.muestra {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
  box-shadow: var(--sombra-suave);
}

.muestra__color {
  display: flex;
  align-items: flex-end;
  min-height: 92px;
  padding: var(--espacio-3);
  color: var(--color-text);
}

.muestra__color--claro {
  color: var(--color-on-primary);
}

.muestra__hex {
  font-family: ui-monospace, 'Cascadia Mono', 'Courier New', monospace;
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.muestra__datos {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--espacio-3) var(--espacio-4) var(--espacio-4);
}

.muestra__datos strong {
  font-size: var(--texto-base);
}

.muestra__datos code {
  color: var(--color-primary-dark);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
}

.muestra__datos span {
  margin-top: var(--espacio-1);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  line-height: 1.35;
}

/* ---------- Tipografía ---------- */
.tipo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--espacio-4);
}

.tipo__muestra {
  display: flex;
  align-items: center;
  gap: var(--espacio-5);
  padding: var(--espacio-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
}

.tipo__aa {
  flex: none;
  color: var(--color-primary);
  font-family: var(--fuente-titulo);
  font-size: 4.5rem;
  font-weight: 600;
  line-height: 0.9;
  letter-spacing: -0.05em;
}

.tipo__muestra--ui .tipo__aa {
  color: var(--color-secondary-dark);
  font-family: var(--fuente);
  font-size: 4rem;
  font-weight: 700;
}

.tipo__muestra strong {
  display: block;
  font-size: var(--texto-lg);
}

.tipo__muestra p {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  line-height: 1.45;
}

.escala {
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface);
  overflow: hidden;
}

.escala__fila {
  display: grid;
  grid-template-columns: 10rem minmax(0, 1fr);
  align-items: baseline;
  gap: var(--espacio-4);
  padding: var(--espacio-3) var(--espacio-5);
  border-bottom: 1px solid var(--color-border);
}

.escala__fila:last-child {
  border-bottom: 0;
}

.escala dt {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.escala dd {
  margin: 0;
}

.escala__display {
  font-family: var(--fuente-titulo);
  font-size: clamp(1.9rem, 1.4rem + 2vw, 2.75rem);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.escala__titulo {
  font-family: var(--fuente-titulo);
  font-size: var(--texto-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.escala__cuerpo {
  max-width: 58ch;
}

.escala__apoyo {
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.escala__cifras {
  color: var(--color-primary-dark);
  font-size: var(--texto-lg);
  font-weight: 700;
}

/* ---------- Controles ---------- */
.demostracion {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-5);
  padding: var(--espacio-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface-2);
}

.demostracion__fila {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--espacio-3);
}

.demostracion__fila--chips {
  padding-top: var(--espacio-4);
  border-top: 1px dashed var(--color-border);
}

/* ---------- Formularios y avisos ---------- */
.duo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  align-items: start;
  gap: var(--espacio-5);
}

.formulario {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.formulario h4 {
  font-family: var(--fuente-titulo);
  font-size: var(--texto-xl);
  font-weight: 600;
}

.avisos-demo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.avisos-demo .aviso {
  justify-content: flex-start;
}

.avisos-demo .interruptor {
  padding: var(--espacio-2) 0;
}

/* ---------- Estados ---------- */
.estados {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--espacio-4);
}

.estados__grupo {
  padding: var(--espacio-4) var(--espacio-5) var(--espacio-5);
}

.estados__grupo h4 {
  margin: 0 0 var(--espacio-3);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.estados__grupo ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* ---------- Ritmo ---------- */
.duo--ritmo {
  align-items: stretch;
}

.ritmo {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-4);
}

.ritmo h4 {
  font-family: var(--fuente-titulo);
  font-size: var(--texto-xl);
  font-weight: 600;
}

.ritmo__lista {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--espacio-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ritmo__item {
  display: flex;
  align-items: center;
  gap: var(--espacio-4);
  padding: var(--espacio-3) var(--espacio-4);
  border: 1px solid var(--color-border);
  border-left: 6px solid var(--color-borde-fuerte);
  border-radius: var(--radio-sm);
  background: var(--color-bg);
}

.ritmo__item--atencion {
  border-left-color: var(--color-advertencia);
}

.ritmo__item--urgente {
  border-left-color: var(--color-peligro);
  background: var(--color-peligro-fondo);
}

.ritmo__tiempo {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  min-width: 3.4rem;
  font-family: var(--fuente-titulo);
  font-size: var(--texto-2xl);
  font-weight: 600;
  line-height: 0.9;
  letter-spacing: -0.04em;
}

.ritmo__tiempo span {
  margin-top: 3px;
  color: var(--color-muted);
  font-family: var(--fuente);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ritmo__item--atencion .ritmo__tiempo {
  color: var(--color-advertencia-texto);
}

.ritmo__item--urgente .ritmo__tiempo {
  color: var(--color-peligro-texto);
}

.ritmo__texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ritmo__texto strong {
  font-size: var(--texto-base);
}

.ritmo__texto span {
  color: var(--color-muted);
  font-size: var(--texto-sm);
  line-height: 1.35;
}

.ritmo__nota {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  line-height: 1.4;
}

/* ---------- Ticket 80 mm ---------- */
.ticket-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--espacio-3);
  padding: var(--espacio-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
  background: var(--color-surface-2);
}

.ticket {
  width: 80mm;
  max-width: 100%;
  padding: 5mm 4mm;
  border-radius: var(--radio-sm);
  background: #fff;
  box-shadow: var(--sombra-elevada);
  color: #111;
  font-family: ui-monospace, 'Cascadia Mono', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.4;
}

.ticket__marca {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1mm;
  padding-bottom: 3mm;
  border-bottom: 1px dashed #555;
  text-align: center;
}

.ticket__marca strong {
  font-family: var(--fuente-titulo);
  font-size: 18px;
  letter-spacing: -0.02em;
}

.ticket__marca span {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ticket__datos {
  display: grid;
  gap: 1mm;
  margin: 3mm 0;
  padding-bottom: 3mm;
  border-bottom: 1px dashed #555;
}

.ticket__datos div {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
}

.ticket__datos dt,
.ticket__datos dd {
  margin: 0;
}

.ticket__datos dt {
  color: #555;
}

.ticket__tabla {
  width: 100%;
  margin: 0 0 3mm;
  border-collapse: collapse;
  font-size: 10.5px;
}

.ticket__tabla th,
.ticket__tabla td {
  padding: 1.2mm 0;
  border-bottom: 1px dotted #aaa;
  text-align: left;
  vertical-align: top;
}

.ticket__tabla th:nth-child(1),
.ticket__tabla td:nth-child(1) {
  width: 8mm;
}

.ticket__tabla th:last-child,
.ticket__tabla td:last-child {
  text-align: right;
  white-space: nowrap;
}

.ticket__total {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
  margin: 0;
  padding: 2mm 0;
  border-top: 2px solid #111;
  border-bottom: 1px dashed #555;
  font-size: 14px;
}

.ticket__pagos {
  display: grid;
  gap: 1mm;
  margin: 2mm 0 0;
  padding: 0;
  list-style: none;
}

.ticket__pagos li,
.ticket__cambio {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
}

.ticket__cambio {
  margin: 1mm 0 0;
  font-weight: 700;
}

.ticket__gracias {
  margin: 4mm 0 0;
  padding-top: 3mm;
  border-top: 1px dashed #555;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.ticket__nota {
  margin: 1mm 0 0;
  color: #555;
  font-size: 9.5px;
  text-align: center;
}

.ticket-preview__nota {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
  text-align: center;
}

/* ---------- Pie ---------- */
.sistema__pie {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--espacio-2) var(--espacio-6);
  padding-top: var(--espacio-6);
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.sistema__pie p {
  margin: 0;
}

/* ---------- Adaptación ---------- */
@media (max-width: 58em) {
  .portada {
    grid-template-columns: minmax(0, 1fr);
  }

  .portada__sello {
    display: none;
  }
}

@media (max-width: 40em) {
  .sistema__version {
    align-self: flex-start;
  }

  .escala__fila {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--espacio-1);
  }

  .demostracion {
    padding: var(--espacio-4);
  }

  .demostracion__fila .btn:not(.btn--icono) {
    flex: 1 1 100%;
  }

  .ticket-preview {
    padding: var(--espacio-3);
  }
}
</style>
