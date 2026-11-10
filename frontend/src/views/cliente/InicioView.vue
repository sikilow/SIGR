
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

// DATOS DEL CLIENTE
interface Cliente {
  id_cliente: number
  nombre: string
  correo: string
}

const router = useRouter()
const cliente = ref<Cliente | null>(null)

// REVISAR SI EL CLIENTE INICIO SESION
onMounted(() => {
  const datos = sessionStorage.getItem('cliente_datos')
  const token = sessionStorage.getItem('cliente_token')

  if (datos && token) {
    try {
      const clienteGuardado = JSON.parse(datos) as Cliente
      cliente.value = clienteGuardado
    } catch {
      sessionStorage.removeItem('cliente_datos')
      sessionStorage.removeItem('cliente_token')
      cliente.value = null
    }
  }
})

// CERRAR SESION
function cerrarSesion() {
  sessionStorage.removeItem('cliente_token')
  sessionStorage.removeItem('cliente_datos')

  cliente.value = null

  router.push('/cliente')
}
</script>

<template>
  <div class="pagina-cliente">

    <!-- BARRA DE NAVEGACION -->
    <header class="encabezado">

      <RouterLink to="/cliente" class="marca">
        <div class="marca-icono">✦</div>

        <div>
          <h2>La Madalena</h2>
          <span>COCINA MEXICANA CONTEMPORÁNEA</span>
        </div>
      </RouterLink>

      <nav class="navegacion">
        <a href="#inicio">Inicio</a>
        <a href="#nosotros">Nosotros</a>

        <!-- CLIENTE SIN SESION -->
        <template v-if="!cliente">
          <RouterLink to="/cliente/login">
            Iniciar sesión
          </RouterLink>

          <RouterLink
            to="/cliente/registro"
            class="boton-registro"
          >
            Registrarse
          </RouterLink>
        </template>

        <!-- CLIENTE CON SESION -->
        <template v-else>
          <span class="nombre-cliente">
            Hola, {{ cliente.nombre }}
          </span>

          <RouterLink to="/cliente/mis-reservaciones">
            Mis reservaciones
          </RouterLink>

          <button
            type="button"
            class="boton-salir"
            @click="cerrarSesion"
          >
            Cerrar sesión
          </button>
        </template>
      </nav>
    </header>

    <!-- PORTADA PRINCIPAL -->
    <main id="inicio" class="portada">

      <section class="contenido-portada">

        <span class="etiqueta">
          {{
            cliente
              ? `BIENVENIDO, ${cliente.nombre.toUpperCase()}`
              : 'BIENVENIDO A LA MADALENA'
          }}
        </span>

        <h1>
          Una mesa.
          <br>
          Grandes momentos.
        </h1>

        <p>
          Descubre una experiencia gastronómica
          donde la tradición mexicana se encuentra
          con la elegancia contemporánea.
        </p>

        <div class="acciones">
          <RouterLink
            to="/cliente/reservar"
            class="boton-principal"
          >
            Reservar una mesa
            <span>→</span>
          </RouterLink>

          <a href="#nosotros" class="boton-secundario">
            Conócenos
          </a>
        </div>

        <div class="detalle">
          <span>TRADICIÓN</span>
          <span>•</span>
          <span>SABOR</span>
          <span>•</span>
          <span>EXPERIENCIA</span>
        </div>

      </section>

      <!-- PANEL DECORATIVO -->
      <section class="panel-visual">

        <div class="circulo circulo-uno"></div>
        <div class="circulo circulo-dos"></div>

        <div class="mensaje-visual">

          <span>LA MADALENA</span>

          <h2>
            El arte de
            <br>
            compartir.
          </h2>

          <div class="linea"></div>

          <p>COCINA MEXICANA CONTEMPORÁNEA</p>
        </div>
      </section>
    </main>

    <!-- SECCION NOSOTROS -->
    <section id="nosotros" class="nosotros">

      <span class="subtitulo">
        NUESTRA ESENCIA
      </span>

      <h2>Momentos que se disfrutan juntos.</h2>

      <p>
        En La Madalena queremos que cada visita
        se convierta en una experiencia especial.
        Reserva tu mesa y disfruta de un espacio
        pensado para compartir.
      </p>

      <RouterLink
        to="/cliente/reservar"
        class="boton-principal"
      >
        Hacer una reservación →
      </RouterLink>

    </section>

    <!-- PIE DE PAGINA -->
    <footer class="pie">

      <div>
        <strong>La Madalena</strong>
        <p>Cocina mexicana contemporánea</p>
      </div>

      <span>
        SIGR · Sistema de Gestión de Restaurante
      </span>

    </footer>

  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.pagina-cliente {
  min-height: 100vh;
  background: #faf5ef;
  color: #251a15;
  font-family: Arial, sans-serif;
}

/* BARRA DE NAVEGACION */

.encabezado {
  background: #faf5ef;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 6%;
  gap: 24px;
}

.marca {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: #301a10;
}

.marca-icono {
  background: #b9390b;
  color: white;
  width: 45px;
  height: 45px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 25px;
}

.marca h2 {
  font-family: Georgia, serif;
  font-size: 25px;
  margin: 0;
}

.marca span {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: #a54b28;
}

.navegacion {
  display: flex;
  align-items: center;
  gap: 25px;
  flex-wrap: wrap;
}

.navegacion a {
  color: #39251c;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
}

.navegacion a:hover {
  color: #b9390b;
}

.navegacion .boton-registro {
  padding: 12px 20px;
  background: #b9390b;
  color: white;
  border-radius: 8px;
}

.navegacion .boton-registro:hover {
  background: #922d08;
  color: white;
}

/* CLIENTE CON SESION */

.nombre-cliente {
  color: #a53a16;
  font-size: 14px;
  font-weight: bold;
}

.boton-salir {
  background: #b9390b;
  color: white;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
}

.boton-salir:hover {
  background: #922d08;
}

/* PORTADA */

.portada {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 580px;
}

.contenido-portada {
  background: #faf5ef;
  padding: 90px 9%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
}

.etiqueta {
  color: #b9390b;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 2px;
}

.contenido-portada h1 {
  font-family: Georgia, serif;
  font-size: clamp(45px, 5vw, 76px);
  line-height: 1.08;
  margin: 25px 0;
  letter-spacing: -2px;
}

.contenido-portada p {
  font-size: 17px;
  line-height: 1.8;
  color: #705b50;
  max-width: 460px;
}

.acciones {
  display: flex;
  gap: 15px;
  margin-top: 30px;
  flex-wrap: wrap;
}

.boton-principal {
  background: #ba3c0c;
  color: white;
  text-decoration: none;
  padding: 16px 25px;
  border-radius: 9px;
  font-weight: bold;
  display: inline-flex;
  gap: 25px;
  align-items: center;
  justify-content: center;
}

.boton-principal:hover {
  background: #942d09;
}

.boton-secundario {
  text-decoration: none;
  color: #a53a16;
  padding: 15px 22px;
  border: 1px solid #cb9f87;
  border-radius: 9px;
  font-weight: bold;
}

.detalle {
  display: flex;
  gap: 14px;
  color: #9d674c;
  font-size: 11px;
  letter-spacing: 2px;
  margin-top: 70px;
}

/* PANEL DECORATIVO */

.panel-visual {
  background: linear-gradient(
    140deg,
    #a92f0c,
    #c94b10 45%,
    #79270f
  );
  color: white;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 480px;
}

.circulo {
  position: absolute;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 50%;
}

.circulo-uno {
  width: 520px;
  height: 520px;
  top: -170px;
  right: -170px;
}

.circulo-dos {
  width: 400px;
  height: 400px;
  bottom: -180px;
  left: -180px;
}

.mensaje-visual {
  z-index: 1;
  text-align: center;
  padding: 35px;
}

.mensaje-visual span {
  font-size: 13px;
  letter-spacing: 5px;
}

.mensaje-visual h2 {
  font-family: Georgia, serif;
  font-size: clamp(45px, 5vw, 75px);
  line-height: 1.1;
  font-weight: normal;
  margin: 30px 0;
}

.linea {
  width: 70px;
  height: 2px;
  background: #f5c9a5;
  margin: 30px auto;
}

.mensaje-visual p {
  font-size: 11px;
  letter-spacing: 2px;
}

/* NOSOTROS */

.nosotros {
  padding: 100px 20px;
  text-align: center;
  max-width: 800px;
  margin: auto;
}

.subtitulo {
  color: #b9390b;
  letter-spacing: 2px;
  font-size: 12px;
  font-weight: bold;
}

.nosotros h2 {
  font-family: Georgia, serif;
  font-size: 42px;
  margin: 22px 0;
}

.nosotros p {
  color: #705b50;
  font-size: 17px;
  line-height: 1.8;
  margin-bottom: 35px;
}

/* PIE DE PAGINA */

.pie {
  background: #2c1b14;
  color: white;
  padding: 35px 6%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.pie strong {
  font-family: Georgia, serif;
  font-size: 25px;
}

.pie p,
.pie span {
  color: #d0b8aa;
  font-size: 12px;
}

/* DISEÑO RESPONSIVO */

@media (max-width: 800px) {
  .encabezado {
    flex-direction: column;
    align-items: flex-start;
  }

  .navegacion {
    gap: 15px;
  }

  .portada {
    grid-template-columns: 1fr;
  }

  .contenido-portada {
    padding: 65px 7%;
  }

  .panel-visual {
    min-height: 350px;
  }

  .detalle {
    margin-top: 45px;
    flex-wrap: wrap;
  }

  .pie {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
