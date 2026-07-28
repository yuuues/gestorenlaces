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
  - Comprobación autónoma cada 60 segundos aunque la web esté cerrada.
  - Incidencias confirmadas tras dos fallos consecutivos, con recordatorios cada 15 minutos y aviso de recuperación.
  - Notificaciones en un canal de Microsoft Teams mediante Teams Workflows.
- Vista de salud con estado del monitor, última/próxima ronda, incidencias y detalle por componente.
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
- `ADMIN_KEY` (requerido para gestionar datos desde la web): clave estática que protege las rutas de escritura (alta/edición/borrado de enlaces y servidores). Si no está configurada, las escrituras quedan deshabilitadas ("fail closed") y devuelven `503`; las rutas de lectura siguen siendo públicas.
- `HEALTH_CHECK_INTERVAL_SECONDS` (opcional, default `60`): frecuencia de comprobación.
- `HEALTH_FAILURE_THRESHOLD` (opcional, default `2`): fallos consecutivos necesarios para abrir una incidencia.
- `HEALTH_REMINDER_MINUTES` (opcional, default `15`): frecuencia máxima de recordatorios mientras continúa el fallo.
- `HEALTH_REQUEST_TIMEOUT_MS` (opcional, default `5000`): timeout por endpoint de salud.
- `TEAMS_HEALTH_WEBHOOK_URL`: URL secreta generada por Teams Workflows para publicar avisos en el canal.

Ejemplo:

```
PORT=5000
ADMIN_KEY=tu-clave-secreta
HEALTH_CHECK_INTERVAL_SECONDS=60
HEALTH_FAILURE_THRESHOLD=2
HEALTH_REMINDER_MINUTES=15
HEALTH_REQUEST_TIMEOUT_MS=5000
TEAMS_HEALTH_WEBHOOK_URL=https://prod-xx.westeurope.logic.azure.com/...
```

La URL de Teams es un secreto: debe vivir solo en `.env`, que ya está excluido
de Git.

## Autenticación

La gestión de datos desde la web (crear/editar/borrar enlaces y servidores) está protegida por una clave estática definida en la variable de entorno `ADMIN_KEY` del fichero `.env`.

- Las rutas de lectura (`GET`) son siempre públicas.
- Las rutas de escritura (`POST`/`PUT`/`DELETE` de bookmarks y servidores) requieren la cabecera `x-admin-key` con el valor de `ADMIN_KEY`.
  - Sin clave configurada en el servidor: las escrituras devuelven `503` (gestión deshabilitada).
  - Clave ausente o incorrecta en la petición: `401`.
- Endpoint de verificación: `POST /api/auth/verify` valida la clave (vía cabecera `x-admin-key`) sin realizar ninguna acción; responde `200` con `{ "ok": true }` si es válida.
- En el frontend, un botón con icono de candado en la cabecera permite "desbloquear" el modo edición introduciendo la clave; mientras esté desbloqueado, la clave se adjunta automáticamente a las peticiones (se guarda en `sessionStorage`, se limpia al cerrar la pestaña). Al bloquear, los controles de edición desaparecen.

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
- `GET /api/health/status` — Devuelve la última instantánea y el estado del monitor (`active`, `degraded` o `stopped`) sin ejecutar comprobaciones.
- `GET /api/health/incidents?limit=20` — Lista solo incidencias confirmadas; no contiene chequeos correctos.
- `GET /api/health/check` — Alias compatible y sin efectos secundarios de `/api/health/status`.
- `POST /api/health/check` — Fuerza una ronda inmediata; requiere `x-admin-key`.

Inicialización: si la tabla `servers` está vacía, se importan datos desde `json/servers.json`.

Notas:
- El backend controla la vigilancia. Cerrar la pestaña o pulsar “Actualizar vista” no detiene ni ejecuta el monitor.
- Un HTTP `200` también se considera fallo si falta `status: "ok"` en la raíz o si cualquier componente es distinto de `ok`.
- Un fallo aislado se descarta. El segundo fallo consecutivo abre una incidencia y publica en Teams.
- Mientras continúe, se recuerda cada 15 minutos; la primera comprobación correcta publica la recuperación.
- SQLite guarda una fila por incidencia, actualizada durante el fallo. No almacena el histórico de resultados correctos.
- Si Teams no responde, la entrega se reintenta sin detener las comprobaciones.

#### Configurar el canal de Teams

1. En Microsoft Teams, abre **Workflows** y crea un flujo con el disparador
   **“When a Teams webhook request is received”**.
2. Añade la acción que publica el mensaje o tarjeta en un canal y selecciona el
   equipo y canal de destino.
3. Guarda el flujo y copia la URL HTTP generada.
4. Pega la URL en `TEAMS_HEALTH_WEBHOOK_URL` dentro de `.env`.
5. Reinicia el backend; con PM2: `pm2 restart gestor --update-env`.

Usa Teams Workflows en lugar de crear un conector clásico “Incoming Webhook”.
Para continuidad operativa, asigna al menos un copropietario al Workflow.

### MCPs (Model Context Protocol)

El backend expone un pequeño catálogo de MCPs definido en `mcp-list/data.json` y permite consultar documentación/archivos de cada MCP:

- `GET /api/mcps` — Devuelve la lista de MCPs (lee `mcp-list/data.json`).
- `GET /api/mcps/:folder/readme` — Devuelve el `readme.md` del MCP.
- `GET /api/mcps/:folder/files` — Lista de ficheros del MCP (excluye `readme.md`).
- `GET /api/mcps/:folder/file/:filename` — Descarga un fichero concreto del MCP.

En el frontend existe una pestaña “MCPs” que consume estas APIs para explorar la documentación.

## Frontend

La UI usa `react-router-dom`, por lo que cada vista tiene una URL canónica enlazable:
- `/` — Bookmarks: listado filtrable por texto con categorías en la barra lateral.
- `/health` — Server Health: estado del monitor autónomo, incidencias y detalle por componente.
- `/mcps` — MCPs: exploración de los MCPs disponibles y lectura de su documentación.
- `/mcps/:folder` — Deep-link al detalle de un MCP concreto (p.ej. `/mcps/sqlserver`); abre directamente su documentación. Si el `folder` no existe, se muestra "MCP no encontrado".

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
- Acceso saliente HTTPS desde el backend hacia la URL del Workflow de Teams.

## Licencia

Si.

