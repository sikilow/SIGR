<script setup lang="ts">
// Referencia para el contador de una venta (solo el gerente). No se emite factura: solo se guarda un id con el que el contador
// ubica la venta y, si el cliente lo pidió, sus datos fiscales (todos opcionales).
import { ref, watch } from 'vue'
import { ErrorServicio, servicios } from '../services'
import type { ReferenciaFiscal, VentaDetalle } from '../types'
import { vPermitir } from '../utils/campos'
import DialogoModal from './DialogoModal.vue'

const props = defineProps<{
  abierto: boolean
  venta: VentaDetalle | null
  origenFoco?: HTMLElement | null
}>()

const emit = defineEmits<{
  cerrar: []
  /** `null` = se quitó la referencia. */
  guardada: [referencia: ReferenciaFiscal | null]
}>()

const referencia = ref('')
const rfc = ref('')
const razonSocial = ref('')
const regimen = ref('')
const codigoPostal = ref('')
const correo = ref('')
const notas = ref('')
const enCurso = ref(false)
const error = ref('')
const tocado = ref(false)

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    const f = props.venta?.referenciaFiscal
    referencia.value = f?.referenciaContador ?? `V-${props.venta?.idVenta ?? ''}`
    rfc.value = f?.rfc ?? ''
    razonSocial.value = f?.razonSocial ?? ''
    regimen.value = f?.regimenFiscal ?? ''
    codigoPostal.value = f?.codigoPostal ?? ''
    correo.value = f?.correo ?? ''
    notas.value = f?.notas ?? ''
    enCurso.value = false
    error.value = ''
    tocado.value = false
  },
)

async function guardar() {
  const venta = props.venta
  if (!venta || enCurso.value) return
  tocado.value = true
  if (!referencia.value.trim()) {
    error.value = 'Escribe la referencia para el contador.'
    return
  }
  enCurso.value = true
  error.value = ''
  try {
    const guardada = await servicios.caja.guardarReferenciaFiscal(venta.idVenta, {
      referenciaContador: referencia.value.trim(),
      rfc: rfc.value.trim() || undefined,
      razonSocial: razonSocial.value.trim() || undefined,
      regimenFiscal: regimen.value.trim() || undefined,
      codigoPostal: codigoPostal.value.trim() || undefined,
      correo: correo.value.trim() || undefined,
      notas: notas.value.trim() || undefined,
    })
    emit('guardada', guardada)
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo guardar la referencia.'
  } finally {
    enCurso.value = false
  }
}

async function quitar() {
  const venta = props.venta
  if (!venta || enCurso.value) return
  enCurso.value = true
  error.value = ''
  try {
    await servicios.caja.quitarReferenciaFiscal(venta.idVenta)
    emit('guardada', null)
  } catch (e) {
    error.value = e instanceof ErrorServicio ? e.message : 'No se pudo quitar la referencia.'
  } finally {
    enCurso.value = false
  }
}
</script>

<template>
  <DialogoModal :abierto="abierto" etiqueta-id="fiscal-titulo" variante="centro" :cerrable="!enCurso" :origen-foco="origenFoco ?? null" @cerrar="emit('cerrar')">
    <form v-if="venta" class="fiscal" novalidate @submit.prevent="guardar">
      <header>
        <h2 id="fiscal-titulo">Referencia para el contador · Ticket #{{ venta.idVenta }}</h2>
        <p class="fiscal__ayuda">
          No se emite factura desde aquí: se guarda un id para que el contador ubique esta venta. Los datos del cliente son opcionales.
        </p>
      </header>

      <div class="campo">
        <label for="fis-ref">Referencia <span class="fiscal__req">(obligatoria)</span></label>
        <input id="fis-ref" v-model="referencia" type="text" maxlength="60" autocomplete="off" :aria-invalid="tocado && !referencia.trim() ? 'true' : undefined" :readonly="enCurso" autofocus />
      </div>

      <fieldset class="fiscal__cliente">
        <legend>Datos del cliente (opcionales)</legend>
        <div class="campo">
          <label for="fis-rfc">RFC</label>
          <input id="fis-rfc" v-model="rfc" type="text" maxlength="13" autocomplete="off" autocapitalize="characters" placeholder="XAXX010101000" :readonly="enCurso" />
        </div>
        <div class="campo">
          <label for="fis-razon">Razón social</label>
          <input id="fis-razon" v-model="razonSocial" v-permitir="'texto'" type="text" maxlength="160" autocomplete="off" :readonly="enCurso" />
        </div>
        <div class="fiscal__par">
          <div class="campo">
            <label for="fis-regimen">Régimen fiscal</label>
            <input id="fis-regimen" v-model="regimen" type="text" maxlength="10" autocomplete="off" placeholder="601" :readonly="enCurso" />
          </div>
          <div class="campo">
            <label for="fis-cp">Código postal</label>
            <input id="fis-cp" v-model="codigoPostal" v-permitir="'digitos'" type="text" inputmode="numeric" maxlength="5" autocomplete="off" :readonly="enCurso" />
          </div>
        </div>
        <div class="campo">
          <label for="fis-correo">Correo</label>
          <input id="fis-correo" v-model="correo" v-permitir="'correo'" type="email" maxlength="120" autocomplete="off" :readonly="enCurso" />
        </div>
      </fieldset>

      <div class="campo">
        <label for="fis-notas">Notas</label>
        <textarea id="fis-notas" v-model="notas" v-permitir="'nota'" maxlength="200" rows="2" :readonly="enCurso" />
      </div>

      <p v-if="venta.referenciaFiscal" class="fiscal__ayuda">
        Guardada por {{ venta.referenciaFiscal.registradoPor }} el
        {{ new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(venta.referenciaFiscal.actualizadoEn) }}.
      </p>

      <div v-if="error" class="aviso aviso--error" role="alert"><p>{{ error }}</p></div>

      <div class="fila-botones">
        <button type="button" class="btn btn--secundario" :aria-disabled="enCurso ? 'true' : undefined" @click="!enCurso && emit('cerrar')">Cancelar</button>
        <button v-if="venta.referenciaFiscal" type="button" class="btn btn--peligro-suave" :disabled="enCurso" @click="quitar">Quitar referencia</button>
        <button type="submit" class="btn" :disabled="enCurso">{{ enCurso ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </form>
  </DialogoModal>
</template>

<style scoped>
.fiscal {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
}

.fiscal__ayuda {
  margin: var(--espacio-1) 0 0;
  color: var(--color-muted);
  font-size: var(--texto-sm);
}

.fiscal__req {
  color: var(--color-muted);
  font-weight: 400;
}

.fiscal__cliente {
  display: flex;
  flex-direction: column;
  gap: var(--espacio-3);
  margin: 0;
  padding: var(--espacio-3) var(--espacio-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radio);
}

.fiscal__cliente legend {
  padding: 0 var(--espacio-2);
  color: var(--color-muted);
  font-size: var(--texto-sm);
  font-weight: 650;
}

.fiscal__par {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--espacio-3);
}
</style>
