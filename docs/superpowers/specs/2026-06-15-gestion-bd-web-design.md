# Gestión de la base de datos desde la web — Diseño

**Fecha:** 2026-06-15
**Estado:** Aprobado (pendiente de plan de implementación)

## Objetivo

Permitir crear, editar y borrar **enlaces (bookmarks)** y **servidores monitorizados** directamente desde la interfaz web, en lugar de tener que editar los ficheros JSON y re-sembrar la base de datos. La base de datos pasa a ser la única fuente de verdad. Las operaciones de escritura quedan protegidas por una clave estática que solo conoce el administrador.

## Decisiones de alcance

- **Entidades gestionables:** enlaces y servidores (ambos).
- **Patrón de UI:** botones de acción (añadir/editar/borrar) + formulario en ventana **modal**.
- **Rol del JSON:** solo semilla de la primera ejecución (si las tablas están vacías). **Sin** espejo automático, **sin** botón de export, **sin** sincronización. La BD manda.
- **Autenticación:** "modo edición desbloqueable" con clave estática.

### Fuera de alcance

- Tabla de categorías dedicada o renombrado masivo de categorías (las categorías se derivan del campo `category` de los enlaces).
- Gestión de usuarios / múltiples cuentas (es una única clave estática compartida).
- Backup/export a JSON (se podrá añadir más adelante si hace falta).

## Arquitectura

- **Backend:** la BD SQLite (`backend/bookmarks.db`) es la fuente de verdad. El CRUD de enlaces y servidores **ya existe**; los cambios son: (1) proteger las rutas de escritura con un middleware de autenticación, (2) añadir un endpoint de verificación de clave. Se elimina cualquier escritura automática al JSON. El seeding desde JSON al arrancar con tablas vacías se mantiene tal cual.
- **Frontend:** se añade un componente `Modal` reutilizable y un formulario por entidad (`BookmarkForm`, `ServerForm`). Las vistas actuales (Bookmarks, Server Health) ganan controles de añadir/editar/borrar, visibles solo en "modo edición". Tras cada operación se **recarga la lista desde la API** (no se manipula el estado local a mano) para reflejar exactamente la BD. La navegación entre vistas y el detalle de MCP pasan a basarse en **enrutado en cliente** (ver sección "Enrutado y enlaces canónicos") en lugar del estado `currentView`/`selectedMcp` actual.

## Enrutado y enlaces canónicos

Hoy el frontend navega por estado (`currentView`, `selectedMcp`), por lo que ningún recurso tiene URL propia: no se puede enlazar, compartir ni recargar una vista concreta. Se introduce enrutado en cliente con **`react-router-dom`** para que cada recurso tenga una URL canónica y direccionable. Esto facilita, entre otras cosas, que una IA construya enlaces directos a un recurso concreto.

- **Tabla de rutas:**
  - `/` → vista de enlaces (Bookmarks).
  - `/health` → vista de salud de servidores.
  - `/mcps` → listado de MCPs.
  - `/mcps/:folder` → detalle de un MCP concreto (p.ej. `/mcps/sqlserver`).
- **Slug:** se usa el valor `folder` de `mcp-list/data.json` (`context7`, `sqlserver`, `jira`), que coincide con el que ya usa la API (`/api/mcps/:folder`). Sin slugs alternativos ni traducción de nombres.
- **Cabecera:** las pestañas pasan a ser enlaces de navegación (`NavLink`) que cambian la URL y marcan la activa según la ruta; se elimina el estado `currentView`.
- **Detalle de MCP:** seleccionar un MCP navega a `/mcps/:folder`; "volver al listado" navega a `/mcps`. Al entrar directamente por `/mcps/:folder` (deep-link o recarga), el componente carga la lista de MCPs si aún no está y resuelve el MCP por su `folder`. Si el `folder` no existe, se muestra un mensaje de "MCP no encontrado" con enlace de vuelta a `/mcps`.
- **Backend:** sin cambios. El catch-all `app.get('*')` ya devuelve `index.html` para cualquier ruta no-`/api`, por lo que los deep-links funcionan al recargar/compartir.

## Autenticación — "modo edición desbloqueable"

### Backend

- `ADMIN_KEY` se lee de `.env` (nunca en código ni en git).
- Middleware `requireAuth` en un módulo compartido `backend/auth.js`. Compara la cabecera de petición `x-admin-key` con `process.env.ADMIN_KEY`.
  - Coincide → `next()`.
  - No coincide o ausente → `401 { error: 'No autorizado' }`.
  - **Fail-closed:** si `ADMIN_KEY` no está definida, todas las escrituras se rechazan con `503 { error: 'Gestión deshabilitada: ADMIN_KEY no configurada' }` y se registra un aviso en el log al arrancar.
- Rutas protegidas (escritura):
  - `POST /api/bookmarks`, `PUT /api/bookmarks/:id`, `DELETE /api/bookmarks/:id`
  - `POST /api/health/servers`, `PUT /api/health/servers/:id`, `DELETE /api/health/servers/:id`
- Rutas públicas (lectura): todos los `GET` actuales siguen sin protección.
- Nuevo endpoint: `POST /api/auth/verify` — aplica `requireAuth`; si pasa, responde `200 { ok: true }`. Lo usa el frontend para validar la clave antes de activar el modo edición, sin ejecutar ninguna operación.
- El módulo `health` importa `requireAuth` desde `backend/auth.js` y lo aplica en sus rutas de escritura dentro de `registerRoutes`.

### Frontend

- Icono de **candado** en la cabecera de la app.
- Al pulsarlo, un modal pide la clave. Se valida con `POST /api/auth/verify`.
  - Correcta → se guarda en `sessionStorage`, se activa el estado `editMode`, aparecen los controles de edición.
  - Incorrecta → mensaje de error en el modal, no se activa el modo edición.
- En `editMode`, las llamadas de escritura adjuntan la cabecera `x-admin-key` mediante un **interceptor de axios** configurado en `api.js` que lee la clave de `sessionStorage`.
- Botón para **bloquear** (sale de `editMode`, borra la clave de `sessionStorage`).
- Si una escritura devuelve `401` (p.ej. la clave cambió en el servidor), el frontend sale de `editMode`, borra la clave y vuelve a pedirla.

## Gestión de enlaces (Bookmarks)

- Botón **"Añadir enlace"** en la cabecera de la vista Bookmarks (visible solo en `editMode`).
- Cada tarjeta de enlace muestra iconos **editar** (lápiz) y **borrar** (papelera) en `editMode`. Borrar pide confirmación.
- **Formulario** (`BookmarkForm`, en modal) con campos:
  - `category` — campo combinado: desplegable con las categorías existentes + opción de escribir una nueva. Crear un enlace con categoría nueva la crea implícitamente; al quedarse sin enlaces, la categoría desaparece.
  - `short_description` (obligatorio)
  - `long_description` (opcional)
  - `link` (obligatorio)
  - `icon` (opcional)
- Validación mínima en cliente: `category`, `short_description`, `link` obligatorios (coincide con el backend).
- Tras crear/editar/borrar: recargar enlaces y categorías desde la API.

## Gestión de servidores (Server Health)

- La vista pasa a cargar **dos fuentes**:
  - `GET /api/health/servers` → registros con `id` (necesario para editar/borrar).
  - `GET /api/health/check` → estado de salud.
  - Se cruzan por `name` para mostrar el estado sobre cada servidor gestionable.
- Botón **"Añadir servidor"** en la cabecera de Server Health (solo en `editMode`); iconos editar/borrar por tarjeta de servidor.
- **Formulario** (`ServerForm`, en modal) con campos: `name` (obligatorio, único), `url` (obligatorio), `description` (opcional).
- Tras crear/editar/borrar: recargar la lista de servidores; opcionalmente relanzar el health check.

## Componentes nuevos (frontend)

- `Modal` — contenedor modal reutilizable (overlay, cierre por botón/escape, título, contenido).
- `BookmarkForm` — formulario de alta/edición de enlace; recibe el enlace a editar (o `null` para alta) y un callback de guardado.
- `ServerForm` — formulario de alta/edición de servidor.
- `UnlockButton` / control de candado + modal de clave (puede vivir en `App.js` o en un componente propio).
- Estado `editMode` y la clave: con el enrutado en cliente, se gestionan en un **contexto ligero** (`EditModeContext`) que envuelve las rutas, en lugar de pasarlos por props a cada vista.
- Configuración del router (`react-router-dom`): `App.js` aloja el `BrowserRouter`/`Routes`; la cabecera (pestañas como `NavLink` + candado) queda fuera de `Routes` para ser común a todas las vistas.

## Errores y casos límite

- Errores de la API se muestran **dentro del modal**; el modal no se cierra si la operación falla, conservando lo escrito.
- Borrado siempre con confirmación.
- `401` en una escritura → salir de `editMode` y volver a pedir la clave.
- `503` (ADMIN_KEY no configurada) → mensaje claro indicando que la gestión está deshabilitada en el servidor.
- Nombre de servidor duplicado (restricción `UNIQUE`) → el backend devuelve error; se muestra en el modal.

## Pruebas

- **Backend:** verificar que las rutas de escritura devuelven `401` sin cabecera / con clave incorrecta y `2xx` con clave correcta; que `POST /api/auth/verify` valida bien; que los `GET` siguen abiertos; que con `ADMIN_KEY` ausente las escrituras dan `503`.
- **Frontend (manual):** desbloquear con clave correcta/incorrecta; crear/editar/borrar enlace y servidor; comprobar que la lista refleja la BD tras cada operación; bloquear y comprobar que desaparecen los controles; simular `401` (clave cambiada) y verificar el re-prompt.
- **Enrutado (manual):** navegar por las pestañas y comprobar que la URL cambia (`/`, `/health`, `/mcps`); abrir directamente `/mcps/sqlserver` (recarga del navegador) y comprobar que carga el detalle correcto; abrir un `/mcps/:folder` inexistente y ver el mensaje de "no encontrado"; "volver al listado" devuelve a `/mcps`.
- **Verificación de build:** `CI=true npm run build` del frontend y arranque del backend sin errores.
