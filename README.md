# Gestor de Enlaces (Bookmarks Manager)

Aplicación web para gestionar enlaces (bookmarks) organizada por categorías, con panel de salud de servicios y listado de MCPs. El proyecto incluye un backend en Node.js/Express con base de datos SQLite y un frontend en React que puede ser servido por el propio backend.

## Funcionalidades principales

- Gestión de enlaces por categorías (CRUD completo sobre SQLite).
- Barra lateral fija con las categorías y filtro por texto en toda la colección.
- Importación inicial automática de enlaces desde `json/bookmarks.json` si la base de datos no existe.
- Exportación de enlaces a JSON vía API.
- Sistema de módulos del backend con autocarga y protección por contraseña para rutas de configuración.
- Módulo de salud de servidores (Health):
  - Alta/edición/baja de servidores a monitorizar.
  - Comprobación periódica del estado de cada servidor (endpoint `/health` de cada servicio monitorizado).
  - Notificaciones locales en Windows cuando un servidor cambia de estado (fallback a consola si falla la notificación).
- Vista de salud de servidores en el frontend con refresco manual y auto‑refresco configurable.
- Listado y exploración de MCPs (Model Context Protocol) con API para leer readme y descargar ficheros.
- El backend compila y sirve el frontend automáticamente si no existe el build.
- Despliegue sencillo con PM2 mediante `ecosystem.config.js`.

## Arquitectura

- Backend: `backend/server.js` (Express, SQLite, carga de módulos, API REST para enlaces, health y MCPs).
- Frontend: React (`frontend/src`), con pestañas para Bookmarks, Server Health y MCPs.
- Datos iniciales: `json/bookmarks.json` y `json/servers.json`.
- Módulos backend: `backend/modules/*` (p.ej. módulo `health`).
- MCPs: `mcp-list/` con definiciones y documentación por cada MCP.

## Estructura del proyecto

```
gestorenlaces/
├── backend/
│   ├── server.js
│   ├── modules/
│   │   └── health/
│   │       └── index.js
│   └── package.json
├── frontend/
│   ├── package.json
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── components/
│       │   ├── CategoryNav.js
│       │   ├── BookmarkList.js
│       │   └── ServerHealth.js
│       └── api.js
├── json/
│   ├── bookmarks.json
│   └── servers.json
├── mcp-list/
│   ├── data.json
│   ├── README.md
│   ├── service/
│   │   └── readme.md
├── ecosystem.config.js
└── README.md
```

## Variables de entorno

Crear un fichero `.env` en la raíz del proyecto o en `backend/` (el servidor carga `.env` desde la raíz superior) con, al menos:

- `PORT` (opcional): Puerto del backend. Por defecto `5000`.

Ejemplo:

```
PORT=5000
```

## Instalación y ejecución

### Opción 1: Desarrollo (backend y frontend separados)

Backend
1. Ir a la carpeta del backend:
   ```
   cd backend
   ```
2. Instalar dependencias:
   ```
   npm install
   ```
3. Ejecutar en modo desarrollo:
   ```
   npm run dev
   ```
   El backend quedará en `http://localhost:5000`.

Frontend
1. En otra terminal:
   ```
   cd frontend
   ```
2. Instalar dependencias:
   ```
   npm install
   ```
3. Ejecutar la aplicación React:
   ```
   npm start
   ```
   El frontend quedará en `http://localhost:3000`.

### Opción 2: Producción (todo servido por el backend)

1. Desde `backend/` instale dependencias y construya el frontend:
   ```
   cd backend
   npm install
   npm run build
   ```
   Nota: `server.js` dispara un build automático del frontend si no encuentra `frontend/build/index.html`.
2. Inicie el servidor:
   ```
   npm start
   ```
   La app se servirá en `http://localhost:5000`.

### Despliegue con PM2

Hay un archivo `ecosystem.config.js` en la raíz. Ejemplos:

```
pm2 start ecosystem.config.js
pm2 status
pm2 logs gestor
```

## API del Backend

### Enlaces (bookmarks)

- `GET /api/bookmarks` — Lista todos los enlaces.
- `GET /api/bookmarks/category/:category` — Lista los enlaces de una categoría.
- `GET /api/categories` — Lista de categorías únicas.
- `POST /api/bookmarks` — Crea un nuevo enlace. Body JSON:
  ```json
  { "category": "Dev", "short_description": "Google", "long_description": "Buscador", "link": "https://google.com", "icon": "" }
  ```
- `PUT /api/bookmarks/:id` — Actualiza campos del enlace indicado.
- `DELETE /api/bookmarks/:id` — Elimina el enlace.
- `GET /api/export` — Exporta los enlaces actuales a `json/bookmarks.json`.

Modelo de datos de un bookmark:
- `category` (string, requerido)
- `short_description` (string, requerido)
- `long_description` (string, opcional)
- `link` (string, requerido)
- `icon` (string, opcional)

Inicialización: la primera vez, si la tabla está vacía, se importan datos desde `json/bookmarks.json`.

### Módulos del backend

El servidor carga automáticamente módulos desde `backend/modules/*` si existe la carpeta.

Rutas relacionadas:
- `GET /api/modules` — Lista módulos cargados y sus rutas.

### Health (salud de servidores)

Rutas del módulo `health`:
- `GET /api/health/servers` — Lista los servidores configurados.
- `POST /api/health/servers` — Crea un servidor a monitorizar. Body JSON: `{ name, url, description }`.
- `PUT /api/health/servers/:id` — Actualiza un servidor.
- `DELETE /api/health/servers/:id` — Elimina un servidor.
- `GET /api/health/check` — Ejecuta el chequeo de salud contra todos los servidores y devuelve un objeto con estados y componentes.

Inicialización: si la tabla `servers` está vacía, se importan datos desde `json/servers.json`.

Notas:
- Las notificaciones locales en Windows se envían vía PowerShell cuando hay cambios de estado.
- El frontend ofrece vista dedicada con auto‑refresco configurable y expansión automática de componentes en error.

### MCPs (Model Context Protocol)

El backend expone un pequeño catálogo de MCPs definido en `mcp-list/data.json` y permite consultar documentación/archivos de cada MCP:

- `GET /api/mcps` — Devuelve la lista de MCPs (lee `mcp-list/data.json`).
- `GET /api/mcps/:folder/readme` — Devuelve el `readme.md` del MCP.
- `GET /api/mcps/:folder/files` — Lista de ficheros del MCP (excluye `readme.md`).
- `GET /api/mcps/:folder/file/:filename` — Descarga un fichero concreto del MCP.

En el frontend existe una pestaña “MCPs” que consume estas APIs para explorar la documentación.

## Frontend

La UI ofrece tres vistas principales accesibles por pestañas:
- Bookmarks: listado filtrable por texto con categorías en la barra lateral.
- Server Health: monitor de salud de servicios con controles de refresco y detalle por componente.
- MCPs: exploración de los MCPs disponibles y lectura de su documentación.

## Datos iniciales

- `json/bookmarks.json`: datos de ejemplo de enlaces. Se importan automáticamente si la base está vacía.
- `json/servers.json`: lista inicial de servidores a monitorizar para el módulo `health`.

## Scripts útiles

En `backend/package.json`:
- `npm run dev` — Ejecuta el servidor con recarga (nodemon).
- `npm start` — Ejecuta el servidor en modo producción.

En `frontend/package.json`:
- `npm start` — Dev server de React.
- `npm run build` — Construye el frontend para producción.

## Requisitos

- Node.js 18+ recomendado.
- Windows para notificaciones nativas del módulo de salud (en otros SO, la notificación hace fallback a consola).

## Licencia

Si.

