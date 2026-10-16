<div align="center">

# SIGR

**Sistema de gestión para restaurantes**
*Del pedido en la mesa a la cuenta, en un solo lugar.*

![Vue](https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square&logo=vuedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Pinia](https://img.shields.io/badge/Pinia-state-F7D336?style=flat-square&logo=pinia&logoColor=black)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)

</div>

> 🚧 **Estado del repositorio:** el rol **hostess** (Salón, Reservaciones y Lista de espera) se desarrolla en la rama `frontend-hostess`, hoy solo sobre el modo *mock*: sus rutas de API están **propuestas**, no implementadas (ver [`docs/contrato-api-hostess.md`](docs/contrato-api-hostess.md)).

---

## ¿Qué es SIGR?

SIGR digitaliza la operación diaria de un restaurante (**La Madalena**): el mesero toma pedidos desde el celular o la tablet, la cocina los recibe, el gerente administra menú, inventario y personal, y la cuenta de cada mesa se lleva de principio a fin. Todos los roles trabajan sobre una misma base de datos MySQL a través de una API REST.

---

## Funcionalidades

| Módulo | Descripción | Estado |
| --- | --- | --- |
| 🔐 **Autenticación** | Inicio de sesión con roles (gerente, mesero, cocinero, cajero, hostess) mediante JWT | ✅ |
| 🍽️ **Panel de mesas** | Estado de cada mesa, cuenta abierta, total y pedidos listos; se actualiza solo | ✅ |
| 🧾 **Pedidos** | Crear, editar, enviar a cocina y cancelar con motivo. El total lo calcula siempre el servidor | ✅ |
| 💳 **Cuenta de mesa** | Consulta de pedidos y total; solicitud de pago en caja o digital | ✅ |
| 👥 **Usuarios** *(gerente)* | Alta, edición, activación y cambio de contraseña | ✅ |
| 📦 **Productos e inventario** *(gerente)* | Categorías, precios, stock mínimo y existencia opcional por producto | ✅ |
| 👨‍🍳 **Cocina** | Cola de pedidos en preparación y marcado como listos | 🚧 |
| 💵 **Caja** | Cobro, pagos divididos y corte de caja (el esquema ya existe) | 🚧 |
| 🪑 **Hostess: Salón** | Estado de las mesas (libres, ocupadas, reservadas), próximas reservaciones y lista de espera; asignar mesa a un grupo. No ve pedidos ni cuentas | ✅ *mock* · API 🚧 |
| 📅 **Hostess: Reservaciones** | Lista por día, alta y edición con búsqueda de clientes, confirmar, cancelar y registrar la llegada | ✅ *mock* · API 🚧 |
| ⏳ **Hostess: Lista de espera** | Grupos por orden de llegada, tiempo de espera con marca de espera larga, agregar, sentar y quitar | ✅ *mock* · API 🚧 |
| 🧮 **Facturación** | Datos fiscales y facturas (el esquema ya existe) | 🚧 |

---

## Stack tecnológico

**Frontend** (`frontend/`)

- [Vue 3](https://vuejs.org) + [Vite](https://vitejs.dev) + TypeScript
- [Pinia](https://pinia.vuejs.org) para el estado y [Vue Router](https://router.vuejs.org)
- [Vitest](https://vitest.dev) para las pruebas
- Modo **mock**: corre sin backend, con datos simulados en memoria

**Backend** (`backend/`)

- [Node.js](https://nodejs.org) + [Express 5](https://expressjs.com) + TypeScript
- [mysql2](https://github.com/sidorares/node-mysql2) con transacciones
- [zod](https://zod.dev) para validar las peticiones
- JWT (`jsonwebtoken`) y `bcryptjs` para la autenticación

**Base de datos** (`database/`)

- MySQL 8.0 (esquema, datos de prueba y migraciones numeradas)

---

## Estructura del proyecto

```
SIGR/
├── backend/
│   └── src/
│       ├── index.ts            # Arranque de Express y montaje de rutas
│       ├── config.ts           # Variables de entorno
│       ├── db.ts               # Pool de MySQL y transacciones
│       ├── dominio.ts          # Reglas y traducciones BD ↔ API
│       ├── errores.ts          # Formato único de errores
│       ├── seed.ts             # Crea los usuarios de prueba
│       ├── middlewares/        # Autenticación y permisos por rol
│       └── routes/             # auth, mesas, menu, pedidos, cuentas, catalogo, usuarios…
├── frontend/
│   └── src/
│       ├── views/              # Pantallas por rol (mesero, hostess, gerente)
│       ├── components/         # Componentes reutilizables
│       ├── services/           # api/ (backend real) y mock/ (datos simulados)
│       ├── stores/             # Estado con Pinia
│       ├── types/              # Modelos del dominio
│       ├── router/             # Rutas y guardas por rol
│       └── utils/              # Carrito, reglas de negocio, formato, contraste
├── docs/                       # Contratos de API, equivalencias con la BD y pantallas (ver el índice abajo)
├── database/
│   ├── schema.sql              # Esquema completo
│   ├── seed.sql                # Datos de prueba (mesas, menú…)
│   ├── seed_demo.sql           # Datos de demostración (mesas 7-12, cuentas, clientes, reservaciones, lista de espera)
│   └── migracion_0N_*.sql      # Cambios incrementales sobre una base existente
```

---

## Instalación local

### Prerrequisitos

- Node.js 22 (mínimo 20.19)
- MySQL 8.0

### Pasos

```bash
# 1. Clonar
git clone https://github.com/sikilow/SIGR.git
cd SIGR

# 2. Base de datos (base nueva)
mysql -u root -p -e "source database/schema.sql"
mysql -u root -p -e "source database/seed.sql"

# 3. Backend
cd backend
npm install
cp .env.example .env        # edita DB_PASSWORD y JWT_SECRET
npx tsx src/seed.ts         # crea los usuarios de prueba
npm run dev                 # http://localhost:3000
# (opcional, base recién creada) datos de demostración, ver el encabezado de database/seed_demo.sql:
# mysql --default-character-set=utf8mb4 -u root -p SIGR < ../database/seed_demo.sql   (crea además a mesero2)

# 4. Frontend (otra terminal)
cd frontend
npm install
cp .env.example .env.local  # pon VITE_USE_MOCK=false para usar el backend real
npm run dev                 # http://localhost:5173
```

> **Base de datos ya existente:** no la recrees. Ejecuta, en orden, las `database/migracion_0N_*.sql` que todavía no hayas corrido.

### Variables de entorno

**`backend/.env`**

```
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=SIGR
JWT_SECRET=cambia_esto_por_algo_largo
# CORS_ORIGIN=http://localhost:5173
```

**`frontend/.env.local`**

```
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:3000/api
```

Con `VITE_USE_MOCK=true` el frontend funciona **sin backend ni base de datos**, ideal para trabajar solo en las pantallas. En ese modo el login lista los usuarios demo: `mesero`, `hostess`, `cajero` y `gerente` (contraseña `1234`).

### Comandos útiles

| Dónde | Comando | Qué hace |
| --- | --- | --- |
| `backend/` | `npm run dev` | API con recarga automática |
| `backend/` | `npm run build` | Revisa tipos y compila a `dist/` |
| `frontend/` | `npm run dev` | Servidor de desarrollo |
| `frontend/` | `npm run build` | Revisa tipos y genera el build |
| `frontend/` | `npx vitest run` | Corre las pruebas |
| `frontend/` | `npm run check` | Tipos + pruebas + build (debe pasar antes de entregar) |
| `frontend/` | `npm run contraste` | Informe de contraste WCAG de los pares de color de la hostess |

---

## Roles y usuarios de prueba

`npx tsx src/seed.ts` crea estos usuarios. **Solo para desarrollo**: cambia las contraseñas en cualquier entorno real.

| Rol | Usuario | Contraseña | Acceso |
| --- | --- | --- | --- |
| Gerente | `gerente` | `1234` | Usuarios, productos e inventario |
| Mesero | `mesero` | `1234` | Mesas, pedidos y cuentas |
| Mesero 2 | `mesero2` | `1234` | Igual que el mesero (solo con `seed_demo.sql`) |
| Cocinero | `cocinero` | `1234` | *(pantalla pendiente)* |
| Cajero | `cajero` | `1234` | *(pantalla pendiente)* |
| Hostess | `hostess` | `1234` | Salón, Reservaciones y Lista de espera *(solo en modo mock hasta que exista su API)* |

---

## Documentación (`docs/`)

| Documento | Para qué sirve |
| --- | --- |
| [`contrato-api-mesero.md`](docs/contrato-api-mesero.md) | Contrato de la API que usa el mesero (implementada en `backend/`) y diferencias con la BD |
| [`contrato-api-hostess.md`](docs/contrato-api-hostess.md) | Endpoints **propuestos** (no implementados) para Salón, Reservaciones, Lista de espera y clientes |
| [`equivalencias-bd.md`](docs/equivalencias-bd.md) | Tabla columna ↔ JSON ↔ TypeScript, qué es columna y qué es calculado, y los estados |
| [`integracion-api.md`](docs/integracion-api.md) | Lista de comprobación para conectar el frontend con la API real |
| [`pantallas-mesero.md`](docs/pantallas-mesero.md) | Pantallas del mesero con su ruta, caso de uso y captura |
| [`pantallas-hostess.md`](docs/pantallas-hostess.md) | Pantallas de la hostess con su ruta y captura, y cómo funciona cada una |
| [`capturas/`](docs/capturas/) | Capturas de las pantallas (1024×768 y 768×1024) |

---

## Flujo de trabajo con Git

- `main` es la rama estable: siempre compila y pasa las pruebas.
- Cada cambio va en su propia rama (`feature/cocina`, `fix/login`…) y entra a `main` por **Pull Request**.
- Antes de abrir un PR, se corre `npm run build` en `backend/` y en `frontend/`, y `npx vitest run` en `frontend/`.
- Si cambias la base de datos, agrega una `migracion_0N_*.sql` y actualiza `schema.sql` en el mismo PR.
- Nunca se suben `.env`, `.env.local` ni `node_modules`.

---

## Equipo de desarrollo

Proyecto desarrollado en el **Instituto Tecnológico de Tepic** — Ingeniería de Software.

- **Jonathan Alexis Bernal Machuca**
- **Hannia Elizabeth González Tapia**
- **Cesar Ruben Ramos Gameros** — [@RubenRamosG](https://github.com/RubenRamosG)
- **Axel Yael Meza Luna** — [@axyameza](https://github.com/axyameza)
- **Carlos David Cortés Hidalgo** — [@Crudecraft9](https://github.com/Crudecraft9)

---

**SIGR** · Instituto Tecnológico de Tepic · Ingeniería de Software · 2026
