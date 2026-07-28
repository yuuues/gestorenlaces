# Monitor autónomo de salud con avisos en Teams — Diseño

**Fecha:** 2026-07-28
**Estado:** Aprobado (pendiente de plan de implementación)

## Objetivo

Convertir la vista `Server Health` en un sistema de vigilancia autónomo. El
backend comprobará los servicios aunque ningún usuario tenga abierta la web y
avisará en un canal de Microsoft Teams cuando detecte una incidencia
confirmada, mientras esta continúe y cuando el servicio se recupere.

Esta primera versión es exclusivamente de control y notificación. No creará
tickets ni ejecutará acciones de remediación.

## Decisiones de alcance

- El monitor se ejecuta dentro del proceso backend existente.
- SQLite conserva el estado necesario para continuar después de un reinicio.
- Se comprueban todos los servidores cada 60 segundos.
- Una incidencia se confirma tras dos comprobaciones fallidas consecutivas.
- Mientras la incidencia continúe, se envía un recordatorio cada 15 minutos.
- Al recuperarse el servicio, se envía un aviso de recuperación.
- Los avisos se publican en un canal de Teams mediante un webhook creado con
  Teams Workflows/Power Automate.
- Un HTTP `200` no basta para considerar sano un servicio: cualquier componente
  interno con estado distinto de `ok` convierte el resultado global en fallo.
- No se guarda histórico de comprobaciones correctas.
- Un fallo aislado que se recupera antes de la segunda comprobación se descarta
  y no permanece en el histórico.
- Cada incidencia confirmada ocupa una sola fila, actualizada mientras dure.

### Fuera de alcance

- Creación o gestión de tickets.
- Reinicios, scripts u otras acciones automáticas.
- Escalados, guardias, responsables o ventanas de mantenimiento.
- Notificaciones directas a usuarios, correo u otros canales.
- Monitor distribuido para varias instancias del backend.
- Métricas detalladas o almacenamiento de todas las muestras de salud.

## Supuestos operativos

- El backend se ejecuta como una única instancia, tal como está configurado
  actualmente en PM2. Si en el futuro se ejecutan varias instancias, será
  necesario añadir elección de líder o un bloqueo distribuido.
- Los servicios monitorizados exponen un endpoint HTTP configurado en la tabla
  `servers`.
- Cuando existe, el cuerpo sigue el contrato actual y puede incluir un objeto
  `components` cuyos valores contienen al menos `status`, y opcionalmente
  `name`, `info` y `errors`.
- La organización permite crear un Workflow de Teams que reciba una petición
  HTTP y publique una tarjeta en el canal elegido.

## Arquitectura

El módulo `backend/modules/health` se separará en unidades pequeñas:

1. **Comprobador HTTP:** consulta un endpoint, normaliza la respuesta y decide
   si el servidor y sus componentes están sanos.
2. **Monitor:** ejecuta rondas cada 60 segundos, impide que se solapen y mantiene
   la última instantánea en memoria para la interfaz.
3. **Gestor de incidencias:** aplica la máquina de estados y persiste únicamente
   fallos provisionales e incidencias confirmadas.
4. **Notificador de Teams:** crea las tarjetas y envía el `POST` al webhook sin
   exponer ni registrar su URL.
5. **Rutas del módulo:** exponen la configuración de servidores, el último
   estado, las incidencias y una comprobación manual protegida.

`index.js` seguirá siendo el punto de entrada del módulo, pero se limitará a
crear/reconciliar el esquema, conectar las unidades, registrar las rutas y
arrancar el monitor una vez que la base de datos esté preparada.

## Ejecución del monitor

- Al arrancar el backend, el módulo prepara el esquema, recupera incidencias
  abiertas y ejecuta una primera ronda.
- Después ejecuta una ronda cada 60 segundos.
- Los servidores de una misma ronda se comprueban en paralelo.
- Cada petición tiene un timeout de 5 segundos.
- Una exclusión de ejecución (`single flight`) evita que empiece una ronda si la
  anterior sigue activa. El ciclo omitido se registra en el log.
- El monitor guarda en memoria la última instantánea completa y metadatos como
  `lastRunAt`, `nextRunAt`, `running` y el resultado por servidor.
- Los resultados correctos sin incidencia no provocan escrituras en SQLite.

Los valores tendrán estos defaults y podrán configurarse mediante variables de
entorno sin necesidad de cambiar código:

- `HEALTH_CHECK_INTERVAL_SECONDS=60`
- `HEALTH_FAILURE_THRESHOLD=2`
- `HEALTH_REMINDER_MINUTES=15`
- `HEALTH_REQUEST_TIMEOUT_MS=5000`
- `TEAMS_HEALTH_WEBHOOK_URL=<secreto>`

La aplicación validará que los valores numéricos sean positivos. Si alguno es
inválido, usará el default y registrará un aviso sin mostrar secretos.

## Evaluación de salud

Una comprobación se considera fallida si sucede cualquiera de estos casos:

- error de DNS, conexión, TLS o cualquier otro error de red;
- timeout;
- código HTTP distinto de `200`;
- cuerpo que no puede interpretarse según el contrato esperado;
- cualquier componente con `status` ausente o distinto de `ok`.

El error normalizado contendrá solo datos útiles para diagnóstico:

- tipo de error;
- mensaje;
- código HTTP, si existe;
- nombres y detalles resumidos de los componentes afectados.

No se almacenará el cuerpo HTTP completo ni cabeceras, para evitar crecimiento
innecesario y la persistencia accidental de información sensible.

## Máquina de estados

Cada servidor sigue uno de estos estados:

- **Sano:** no existe incidencia activa.
- **Fallo provisional:** ha fallado una vez. Se conserva el mínimo estado para
  poder confirmar el siguiente fallo incluso después de un reinicio.
- **Incidencia abierta:** se han producido dos fallos consecutivos y se ha
  confirmado el problema.
- **Incidencia resuelta:** una incidencia abierta ha recibido una comprobación
  correcta.

Transiciones:

1. `Sano → Fallo provisional`: primer fallo; no se notifica.
2. `Fallo provisional → Sano`: siguiente comprobación correcta; se elimina el
   registro provisional y no queda histórico.
3. `Fallo provisional → Incidencia abierta`: segundo fallo consecutivo; se
   envía la alerta inicial.
4. `Incidencia abierta → Incidencia abierta`: se actualiza la misma fila con el
   error más reciente y el contador. Solo se notifica si han transcurrido 15
   minutos desde el último aviso entregado.
5. `Incidencia abierta → Incidencia resuelta`: comprobación correcta; se marca
   la hora de resolución y se envía la recuperación.

La entrega a Teams se controla por separado del estado real del servicio. Si el
webhook falla, el servicio mantiene el estado determinado por su comprobación y
la notificación queda pendiente para reintentarse en el siguiente ciclo. Si una
incidencia se resuelve antes de que Teams acepte la alerta inicial, se enviará
una única tarjeta resumen indicando que la incidencia ocurrió y ya está
resuelta.

## Persistencia

Se añadirá una tabla `health_incidents` con una fila por fallo provisional o
incidencia:

- `id`
- `server_id`
- `server_name` como copia histórica
- `status`: `pending`, `open` o `resolved`
- `first_failed_at`
- `last_failed_at`
- `opened_at`
- `resolved_at`
- `consecutive_failures`
- `last_error` con el error normalizado
- `resolution_reason`: `recovered` o `monitor_removed`
- `alert_notified_at`
- `last_reminder_at`
- `recovery_notified_at`
- `notification_attempts`

Habrá como máximo una incidencia `pending` u `open` por servidor. Las
incidencias resueltas se conservarán inicialmente sin borrado automático: el
volumen es una fila por incidencia confirmada, no una fila por minuto. Una
política de retención podrá añadirse más adelante si el volumen real lo exige.

## Avisos de Teams

El backend enviará tarjetas adaptativas diferenciadas:

- **Incidencia — rojo:** servidor, URL, hora de inicio, error y componentes
  afectados.
- **Sigue fallando — naranja:** los mismos datos, duración acumulada, número de
  comprobaciones fallidas y hora del aviso anterior.
- **Recuperado — verde:** servidor, hora de recuperación y duración total.

La URL `TEAMS_HEALTH_WEBHOOK_URL` solo se leerá en el backend desde `.env`.
Nunca se devolverá por la API, se incluirá en logs ni se enviará al frontend.

Si el webhook no está configurado, el monitor seguirá funcionando y dejará un
aviso claro en el log. Si está configurado pero Teams responde con error o agota
el timeout, la entrega se marcará como pendiente y se reintentará sin bloquear
la siguiente ronda de salud.

## API

La API separará lectura de estado y ejecución:

- `GET /api/health/status`: devuelve la última instantánea en memoria y los
  metadatos del monitor. No ejecuta peticiones ni envía avisos.
- `GET /api/health/incidents?limit=20`: devuelve únicamente incidencias,
  ordenadas de más reciente a más antigua. El límite tendrá un máximo seguro.
- `POST /api/health/check`: fuerza una ronda inmediata, respeta el bloqueo
  contra solapamientos y requiere `x-admin-key`.
- Las rutas CRUD de `/api/health/servers` se mantienen.

El actual `GET /api/health/check`, que realiza trabajo y puede generar
notificaciones, se convertirá en un alias de lectura de
`GET /api/health/status` para conservar compatibilidad. No realizará
comprobaciones ni tendrá efectos secundarios. El frontend pasará a usar la ruta
de estado explícita.

## Interfaz `Server Health`

- La vigilancia se presenta como un servicio del backend siempre activo; se
  eliminan los controles `Start/Stop` que actualmente solo controlan el
  navegador.
- La interfaz consulta `GET /api/health/status` periódicamente para refrescar la
  visualización. Cerrar la pestaña no afecta al monitor.
- La cabecera muestra si el monitor está activo, la última ronda y la próxima
  ronda prevista.
- Cada servidor muestra el último estado conocido, la hora de comprobación y
  los componentes afectados.
- Si existe, muestra la incidencia abierta o la última incidencia resuelta.
- El botón de refresco visual solo vuelve a leer el último estado.
- Cuando el modo edición está desbloqueado, una acción separada
  **“Comprobar ahora”** puede llamar al `POST` protegido.

## Errores y casos límite

- Un servidor eliminado deja de monitorizarse. Su estado provisional se
  elimina. Si tenía una incidencia abierta, esta se cierra con
  `resolution_reason=monitor_removed`, se conserva como histórico y no se envía
  una falsa tarjeta de recuperación.
- Un servidor renombrado mantiene asociada su incidencia por `server_id` y
  conserva el nombre original como dato histórico de apertura.
- Si no hay servidores, el monitor se mantiene activo y devuelve una
  instantánea vacía.
- Una respuesta HTTP tardía no modifica una ronda que ya se haya cerrado.
- Los errores de un servidor no impiden comprobar los demás.
- Los errores de SQLite o de inicialización impiden arrancar el planificador y
  quedan claramente registrados; la API informa de que el monitor no está
  disponible.
- Los fallos de Teams nunca se interpretan como fallos o recuperaciones de los
  servicios monitorizados.

## Pruebas

### Unitarias

- Clasificación de HTTP `200`, HTTP no `200`, timeout, error de red y respuesta
  inválida.
- Evaluación de componentes: todos `ok` frente a uno o varios con error.
- Máquina de estados completa, incluido el descarte de un fallo aislado.
- Confirmación exacta en el segundo fallo.
- Recordatorios solo después de 15 minutos.
- Recuperación y cálculo de duración.
- Formato de las tres tarjetas de Teams.
- Reintentos de notificaciones fallidas sin cambiar el estado de salud.

### Integración

- Persistencia y recuperación de una incidencia abierta tras reiniciar el
  monitor.
- Una sola fila por incidencia aunque haya muchos fallos.
- Ausencia de filas para comprobaciones correctas.
- Exclusión de rondas solapadas.
- Comprobación concurrente de varios servidores.
- Endpoints de estado e incidencias sin efectos secundarios.
- Protección de la comprobación manual con `ADMIN_KEY`.

Las pruebas usarán reloj, servidor HTTP y webhook simulados. Nunca dependerán de
los servidores reales ni enviarán mensajes al canal real de Teams. La suite
backend existente deberá continuar pasando y el frontend deberá compilar sin
errores.

## Criterios de aceptación

1. Con la web cerrada, el backend comprueba los servidores cada 60 segundos.
2. Un único fallo seguido de éxito no deja histórico ni envía mensajes.
3. Dos fallos consecutivos abren una incidencia y generan una tarjeta roja.
4. Un componente en error con HTTP `200` abre incidencia con la misma política.
5. Una incidencia sostenida genera como máximo un recordatorio cada 15 minutos.
6. La primera comprobación correcta tras una incidencia envía una tarjeta verde.
7. Reiniciar el backend no duplica alertas ni pierde incidencias abiertas.
8. Los chequeos correctos no se almacenan.
9. Un fallo de Teams no detiene el monitor y su aviso se reintenta.
10. La pantalla muestra el estado del monitor sin controlar su ejecución.
