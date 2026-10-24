# Integración de Resend para reservaciones

Esta guía explica cómo SIGR envía recordatorios y avisos de vencimiento mediante [Resend](https://resend.com), qué configurar en el backend y cómo comprobar el resultado.

## Seguridad de la API key

La API key compartida en el chat debe considerarse expuesta. Revócala desde el panel de Resend y crea una nueva antes de habilitar el envío. No la copies a este documento, a `backend/.env.example`, al código fuente, a capturas ni a Git.

Guarda la nueva key únicamente en el archivo local `backend/.env`, que no debe versionarse. No la escribas en comandos de terminal que queden en el historial ni en mensajes de commit. Si una key real llegó a un repositorio, aunque luego se borre, revócala y reemplázala.

## Qué se implementó

- El backend usa la API HTTPS de Resend directamente; no requiere Nodemailer ni configuración SMTP.
- `backend/src/services/notificacionesReservacion.ts` envía solicitudes `POST` a `https://api.resend.com/emails` desde un proceso del servidor, incluyendo `RESEND_API_KEY` como Bearer token.
- El remitente se toma de `RESEND_FROM`; destinatario, asunto y texto se forman según el tipo de notificación: recordatorio o reservación vencida.
- Si la API de Resend responde con error o no está configurada, la notificación no se marca como enviada. El backend guarda el error e intenta enviarla más adelante mediante la cola `notificacion_reservacion`.
- La clave nunca se envía al frontend ni se devuelve desde un endpoint.

## Configuración inicial

### 1. Verificar el dominio emisor

En Resend, agrega un dominio propio y completa las verificaciones DNS que muestra el panel. Debe aparecer verificado para poder enviar a clientes. Usa un remitente de ese dominio, por ejemplo `Reservaciones <reservaciones@tudominio.com>`.

Para pruebas iniciales, Resend puede restringir el envío a direcciones permitidas en la cuenta; sigue los requisitos que muestra tu panel. No uses un remitente de ejemplo en producción.

### 2. Crear una API key

En el panel, crea una API key con permisos de envío de correo para este proyecto. Copia el valor una sola vez y mantenlo privado. Si se pierde o se comparte, revócala y crea otra.

### 3. Configurar `backend/.env`

Copia las variables de ejemplo, sin incluir una key real en el repositorio:

```env
RESEND_API_KEY=re_pon_aqui_la_key_nueva
RESEND_FROM="Restaurante <reservaciones@tudominio.com>"
```

`RESEND_FROM` debe usar una dirección asociada al dominio verificado en Resend. Conserva también las variables requeridas de MySQL y `JWT_SECRET` en ese mismo archivo. No agregues `VITE_RESEND_API_KEY` ni una variable `RESEND_API_KEY` al entorno del frontend: la key es exclusivamente del backend.

### 4. Reiniciar el backend

Las variables de entorno se leen al iniciar el proceso. Desde PowerShell:

```powershell
Push-Location backend
npm run dev
Pop-Location
```

En el entorno de despliegue, configura `RESEND_API_KEY` y `RESEND_FROM` en el administrador de secretos de la plataforma, y reinicia el servicio. No subas `backend/.env`.

## Flujo de las notificaciones

1. El backend revisa la cola aproximadamente cada 30 segundos.
2. Crea el recordatorio cuando la hora de la reservación entra en el intervalo configurado por el gerente.
3. Una reservación pendiente o confirmada que pasa de `fecha_hora + tolerancia_minutos` sin llegada se marca `vencida`. En la misma operación, se desvincula la mesa y se libera si no queda otra reservación vigente.
4. Se crea una notificación de vencimiento explicativa para el correo del cliente.
5. Cuando Resend acepta el mensaje, la fila se marca `enviada`. Ante errores de red, key inválida, dominio no verificado o límite del proveedor, se conserva como pendiente, se incrementa `intentos`, se guarda `ultimo_error` y se programa un nuevo intento con espera progresiva.

La tabla `notificacion_reservacion` evita crear más de un aviso del mismo tipo por reservación. Un fallo en el correo no revierte el estado de vencimiento ni bloquea que se libere la mesa.

## Comprobación

1. Confirma que la migración `010_reservaciones_y_caracteristicas.sql` está aplicada y existe `notificacion_reservacion`.
2. Configura un correo válido para un cliente de prueba y crea una reservación futura desde **Hostess → Reservaciones**.
3. Para probar un recordatorio sin esperar, desde **Gerente → Reservas** configura una anticipación que incluya la hora de prueba; el proceso de backend debe dejar una notificación `recordatorio`.
4. Comprueba en Resend → Emails que aparece el mensaje y que el estado sea aceptado/entregado según el panel.
5. Para verificar el error controlado, usa una key de prueba inválida solo en un entorno local sin datos reales, reinicia el backend y revisa `notificacion_reservacion.ultimo_error` e `intentos`. Después restaura la key válida.
6. No pruebes el vencimiento modificando datos reales de clientes. Usa una base de desarrollo aislada y una reservación de prueba.

Consulta el estado de la cola en MySQL:

```sql
SELECT id_notificacion, id_reservacion, tipo, estado, intentos, ultimo_error, creada_en, enviada_en
FROM notificacion_reservacion
ORDER BY id_notificacion DESC
LIMIT 20;
```

Si no se envía:

- Revisa que el backend se reinició después de configurar variables.
- Comprueba que `RESEND_API_KEY` no tenga espacios ni comillas sobrantes y que no haya sido revocada.
- Verifica que `RESEND_FROM` coincida con el dominio verificado.
- Lee `ultimo_error` en la cola y los logs del backend; nunca imprimas el valor de la API key.
- Revisa en Resend el registro del mensaje, la verificación del dominio y los límites de la cuenta.

## Fuentes oficiales

- [Resend — Introduction](https://resend.com/docs/introduction)
- [Resend — Send Email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend — Verified Domains](https://resend.com/docs/dashboard/domains/introduction)
- [Resend — Create an API key](https://resend.com/docs/create-an-api-key)
- [Resend — Node.js Quickstart](https://resend.com/docs/send-with-nodejs)
