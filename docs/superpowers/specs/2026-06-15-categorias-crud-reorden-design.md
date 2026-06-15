# Categorías: CRUD y reordenación — Diseño

**Fecha:** 2026-06-15
**Estado:** Aprobado (pendiente de plan de implementación)
**Rama:** feature/gestion-bd-web

## Objetivo

Permitir **crear, renombrar, borrar y reordenar categorías** desde la interfaz web, en
modo edición. Hoy las categorías no existen como entidad: se derivan con
`SELECT DISTINCT category FROM bookmarks` (`backend/server.js`), por lo que no tienen
orden, ni IDs, ni pueden existir vacías. Esta funcionalidad reabre — de forma
intencionada — la decisión que el spec `2026-06-15-gestion-bd-web-design.md` dejó fuera
de alcance ("Tabla de categorías dedicada"), porque para ordenar/crear/renombrar/borrar
limpiamente las categorías deben ser una entidad real con posición.

## Decisiones de alcance

- **CRUD completo de categorías** (crear vacías, renombrar, borrar) + **reordenar**.
- **Borrado bloqueante:** no se puede borrar una categoría que tiene enlaces; primero hay
  que mover o borrar sus enlaces.
- **Reordenar con flechas ↑/↓** (sin drag & drop, sin dependencias nuevas).
- **Controles en la barra lateral** (`CategoryNav`), visibles solo en modo edición.
- **Enfoque de datos A — catálogo ligero:** tabla `categories(id, name, position)`; los
  enlaces siguen guardando `category` como texto (sin migración de esquema).

### Fuera de alcance

- Atributos extra por categoría (color, icono, descripción): solo `name`.
- Export del orden de categorías a JSON (la BD es la fuente de verdad).
- Drag & drop.
- Clave foránea `bookmarks.category_id` (enfoque B): demasiado cambio/riesgo para el
  tamaño de la herramienta.

## Modelo de datos

Nueva tabla en `bookmarks.db`, propiedad de `server.js` (igual que `bookmarks`):

```sql
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL
);
```

- Los enlaces conservan su columna `category` (texto). El nombre de la categoría vive en
  dos sitios; por eso **renombrar es una transacción** que actualiza ambas tablas.
- **Siembra inicial:** al arrancar, si `categories` está vacía, se rellena desde
  `SELECT DISTINCT category FROM bookmarks` asignando `position` 0..n. Debe ejecutarse
  **después** de la siembra de `bookmarks` (encadenada en la finalización de
  `initDbFromJson`) para que ya existan los datos de los que derivar.
- **Cambio de comportamiento intencionado:** una categoría sin enlaces ya **no
  desaparece** (antes era derivada). Persiste hasta que se borra explícitamente —
  requisito para poder crear y mantener categorías vacías.

## Endpoints

Las escrituras se protegen con `requireAuth` (`backend/auth.js`), igual que el resto de
la gestión. Viven en `server.js`, junto al CRUD de enlaces y al `GET /api/categories`
actual (las categorías son intrínsecas a los enlaces, que son core del servidor).

| Método | Ruta | Cuerpo | Comportamiento |
|--------|------|--------|----------------|
| GET | `/api/categories` | — | **Cambia:** devuelve `[{ id, name, position }]` ordenado por `position`. (Antes: array de strings.) |
| POST | `/api/categories` | `{ name }` | Crea categoría vacía al final (`position = max+1`). `400` si `name` vacío; `409` si duplicada. |
| PUT | `/api/categories/:id(\d+)` | `{ name }` | **Renombra en transacción:** `UPDATE categories SET name=?` + `UPDATE bookmarks SET category=? WHERE category=?`. `404` si no existe; `409` si el nuevo nombre colisiona. Renombrar al mismo nombre se permite (no-op de colisión). |
| DELETE | `/api/categories/:id(\d+)` | — | `409` si la categoría tiene enlaces (`COUNT(bookmarks WHERE category=name) > 0`); si está vacía, la borra. `404` si no existe. |
| PUT | `/api/categories/reorder` | `{ ids: [...] }` | Reescribe `position` (0..n) según el orden recibido, en transacción. |

- **Orden de rutas / colisión:** la restricción `:id(\d+)` hace que `reorder` no encaje
  como `:id`, evitando ambigüedad.
- **Transacciones:** renombrar (2 `UPDATE`) y reordenar (N `UPDATE`) usan
  `BEGIN`/`COMMIT` con `ROLLBACK` en error.
- **Sincronización implícita:** `POST /api/bookmarks` y `PUT /api/bookmarks/:id` hacen
  `INSERT OR IGNORE INTO categories (name, position) VALUES (?, max+1)` para la categoría
  del enlace, manteniendo el flujo actual "+ Nueva categoría…" del formulario de enlaces.

## Frontend

- **`src/api.js`:** añadir `createCategory(name)`, `renameCategory(id, name)`,
  `deleteCategory(id)`, `reorderCategories(ids)`. `getCategories` ya existe (ahora
  devuelve objetos).
- **`src/views/BookmarksView.js`:** `categories` pasa a ser un array de objetos. Deriva
  `categoryNames = categories.map(c => c.name)` y lo pasa a `BookmarkList` y
  `BookmarkForm` (que siguen trabajando con strings — sin cambios internos). A
  `CategoryNav` le pasa los objetos + `editMode` + handlers. Añade los handlers
  (`handleAddCategory`, `handleRenameCategory`, `handleDeleteCategory`,
  `handleMoveCategory`) reutilizando el patrón de error/`401→lock` de `handleDelete`.
  Tras cada operación recarga categorías; si la `selectedCategory` ya no existe
  (renombrada/borrada), vuelve a la primera.
- **`src/components/CategoryNav.js`:** en `editMode` muestra botón **"+ Añadir
  categoría"** arriba e, por cada categoría, iconos **editar / borrar / ↑ / ↓** (↑
  deshabilitado en la primera, ↓ en la última). Los botones hacen `stopPropagation`
  para no disparar el scroll a la sección. Cada ↑/↓ recalcula la lista de `ids` y la
  persiste al momento con `reorderCategories`.
- **Nuevo `src/components/CategoryForm.js`:** modal de un solo campo (`name`), siguiendo
  el patrón de `BookmarkForm` (usa `Modal`, muestra el error dentro del modal sin
  cerrarlo, maneja `401`). Se usa para crear y para renombrar. El borrado usa
  `window.confirm` (como los enlaces).

## Errores y casos límite

- Nombre duplicado (restricción `UNIQUE`) → `409` → mensaje dentro del modal.
- Borrar categoría con enlaces → `409` → alerta "No se puede borrar: la categoría tiene
  N enlaces".
- `401` en una escritura → salir de `editMode`, borrar la clave y re-pedirla (patrón
  existente). `503` (sin `ADMIN_KEY`) → mensaje de gestión deshabilitada.
- Reordenar es idempotente (se envía la lista completa de `ids`), sin condiciones de
  carrera entre clics rápidos.
- Tras renombrar/borrar, si la categoría seleccionada deja de existir, se selecciona la
  primera de la lista recargada.

## Pruebas

- **Backend:** las escrituras devuelven `401` sin clave / con clave incorrecta y `2xx`
  con clave correcta; `GET /api/categories` devuelve objetos ordenados; el borrado se
  bloquea con `409` cuando la categoría tiene enlaces y procede cuando está vacía;
  renombrar actualiza también los enlaces; reordenar persiste el nuevo orden; nombre
  duplicado da `409`; con `ADMIN_KEY` ausente las escrituras dan `503`.
- **Frontend (manual):** añadir/renombrar/borrar/reordenar en modo edición; comprobar que
  la barra lateral y el agrupado de enlaces reflejan los cambios; en modo bloqueado no
  aparecen controles; simular `401` (clave cambiada) y verificar el re-prompt.
- **Verificación de build:** `CI=true npm run build` del frontend y arranque del backend
  sin errores.
