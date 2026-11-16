# Acceso de clientes con Google

El portal de clientes (`/cliente`) ofrece **dos formas de entrar y de crear cuenta**, y conviven:

1. **Correo y contraseña** (como siempre): nombre, correo, teléfono de 10 dígitos y contraseña de 8 a 72 caracteres.
2. **Google**: un botón «Iniciar sesión con Google» / «Registrarse con Google». La persona elige su cuenta y listo; no necesita contraseña.

El botón **solo aparece cuando el servidor tiene configurado el ID de cliente de Google**. Sin él, el portal funciona exactamente como antes (solo correo y contraseña).

## Cómo funciona

1. El navegador carga el botón oficial de Google (Google Identity Services). El ID de cliente lo da la API en `GET /api/auth-clientes/google/config`, así que **solo se configura en el backend**.
2. Al elegir una cuenta, Google entrega un token firmado. El navegador lo manda a `POST /api/auth-clientes/google`.
3. El servidor **verifica el token con Google** (firma, vigencia y que sea para esta aplicación) y exige que el correo esté verificado. Después:
   - **La cuenta de Google ya está ligada a un cliente** → inicia sesión.
   - **Ya existe un cliente con ese correo y contraseña propia** → se liga Google a esa cuenta (Google verificó el correo) e inicia sesión. Se conserva su historial.
   - **Es nuevo, o solo lo registró la hostess** → falta el **teléfono** (Google no lo da). El servidor responde `requiere_telefono` con un token de registro de 15 minutos; el portal muestra «Un último paso» con el nombre (editable) y el teléfono.
4. `POST /api/auth-clientes/google/completar` crea la cuenta **sin contraseña**. Si la hostess ya había registrado a esa persona con ese correo, solo se liga si el **teléfono coincide** con el que dio en el restaurante (la misma regla del registro normal).
5. La sesión es la de siempre (JWT de 8 horas): reservar y «Mis reservaciones» no cambian.

Una cuenta creada con Google no tiene contraseña: si alguien intenta entrar con correo y contraseña, el portal le indica que use el botón de Google.

## Cómo configurarlo (una sola vez)

1. Entra a <https://console.cloud.google.com/> con una cuenta de Google del equipo y crea un proyecto (por ejemplo «SIGR»).
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre de la app «La Madalena», correo de soporte, y guarda. Mientras esté en modo *Pruebas*, agrega como *usuarios de prueba* los correos que van a probar.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - **Orígenes de JavaScript autorizados** (son direcciones, sin ruta ni barra final):
     - `http://localhost:5173` (desarrollo)
     - el dominio real del servidor con **HTTPS**, por ejemplo `https://madalena.ejemplo.com`
   - No hace falta «URI de redireccionamiento» con este método.
4. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`) y ponlo en `backend/.env`:

   ```
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```

   Reinicia el backend. **El ID de cliente no es un secreto**; no se necesita ninguna clave secreta para este método. Aun así, `backend/.env` no se sube a Git.
5. Abre `/cliente/login`: debe verse el botón de Google bajo el formulario.

Notas:

- Google exige **HTTPS** en producción (solo `localhost` puede usar HTTP). El servidor de la máquina virtual necesita un dominio con certificado (por ejemplo, con Nginx).
- Si el navegador no tiene internet o bloquea Google, el botón no se muestra y el formulario de correo sigue funcionando.
- Para publicar la app a cualquier persona (no solo usuarios de prueba), hay que pasar la pantalla de consentimiento a *En producción*; para los datos básicos que usamos (correo y nombre) Google no pide una revisión larga.

## Base de datos

Migración **020** (`database/migrations/020_acceso_google_clientes.sql`): `cliente_credencial.google_sub` (único) y `password_hash` opcional. `init.sql` ya la incluye. Una base nueva no necesita aplicarla.

## Archivos

- Backend: `controllers/authClientes.ts`, `routes/authClientes.ts`, `services/google.ts`, `utils/config.ts` y las pruebas `tests/authGoogle.test.ts`.
- Frontend: `components/cliente/AccesoGoogle.vue`, usado en `views/cliente/LoginClienteView.vue` y `RegistroView.vue`.
