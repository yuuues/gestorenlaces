# Avisos e histórico de incidencias en Server Health

## Objetivo

Introducir `warning` como un estado informativo distinto de `error` y ofrecer
un histórico completo, de sólo lectura, para cada servidor. Los errores deben
mostrar su diagnóstico real y una línea temporal clara; los avisos nunca deben
generar mensajes de Teams.

## Alcance

Esta fase incluye:

- clasificación y presentación diferenciada de `ok`, `warning` y `error`;
- reglas de incidencias y Teams para cada estado;
- rediseño de las tarjetas de incidencia con una línea temporal;
- una pantalla dedicada y paginada para el histórico de cada servidor;
- filtros por estado, periodo y componente.

Quedan fuera de alcance los comentarios, anotaciones, edición manual de
incidencias y persistencia de avisos. No se crearán columnas o contratos
provisionales para comentarios.

## Clasificación de estados

El evaluador aplicará esta prioridad:

1. Un error HTTP sin un payload health estructurado válido es `error`.
2. Un estado superior `error` o cualquier componente con estado `error` hace
   que el servidor sea `error`.
3. Si no hay errores, un estado superior `warning` o cualquier componente con
   estado `warning` hace que el servidor sea `warning`.
4. Sólo un payload superior `ok` sin componentes en error o aviso es `ok`.

Los componentes afectados se conservarán completos para que la interfaz pueda
mostrar sus campos `errors` e `info`. El diagnóstico normalizado separará
errores y avisos: un resultado `warning` tendrá `error: null` y un objeto
`warning` con mensaje y componentes afectados. Los errores conservarán
`error`, incluida la información HTTP cuando corresponda.

Cuando un payload estructurado devuelva HTTP 500 porque uno de sus checks está
en `error`, prevalecerá el diagnóstico del check y el código HTTP quedará como
metadato. Un warning acompañado de un HTTP de error no ocultará el fallo de
transporte: seguirá clasificándose como `error`.

## Incidencias y Teams

Sólo los resultados `error` incrementan fallos consecutivos, abren incidencias
y generan aperturas o recordatorios en Teams.

Un resultado `warning` será informativo:

- sin incidencia activa, no se persistirá nada;
- con una incidencia `pending`, se descartará el pendiente para romper la
  secuencia de errores consecutivos;
- con una incidencia `open`, se resolverá silenciosamente con motivo
  `warning`, marcando la recuperación como ya gestionada;
- nunca generará apertura, recordatorio, resumen de resolución ni recuperación
  en Teams, tampoco cuando posteriormente llegue un `ok`.

El paso directo de `error` a `ok` conservará el flujo actual: resolverá la
incidencia y solicitará el aviso normal de recuperación. Los avisos no se
guardarán como entradas del histórico.

## Presentación de estado actual

El dashboard tendrá tres apariencias:

- `ok`: verde, icono de confirmación y texto `OK`;
- `warning`: ámbar, icono de aviso y texto `Aviso`;
- `error`: rojo, icono de error y texto `Error`.

La misma semántica se aplicará al servidor y a cada componente. Los
componentes `warning` y `error` se abrirán automáticamente para mostrar el
mensaje original. Un warning no aparecerá dentro del resumen de incidencias.

## Tarjeta de incidencia

Cada incidencia se mostrará como un bloque independiente con el diseño de
línea temporal aprobado:

- título con el subcheck o componentes afectados;
- badge `Abierta` o `Resuelta`;
- mensaje real de `last_error.message` destacado;
- evento de detección usando `first_failed_at`;
- evento final usando `resolved_at`, o `En curso` si sigue abierta;
- duración y número de fallos consecutivos.

Para una resolución silenciosa por warning, el evento final dirá que el error
pasó a estado de aviso. Para una recuperación `ok`, dirá `Servicio recuperado`.
Los errores de red sin subcheck usarán el nombre del servidor como contexto.

## Histórico por servidor

Cada tarjeta de servidor ofrecerá una acción clara `Ver histórico` que navega
a `/health/servers/:serverId/history`. Se usará una acción explícita en vez de
convertir toda la tarjeta en un enlace, porque la tarjeta ya contiene botones
de edición, borrado y expansión de componentes.

La pantalla dedicada mostrará:

- nombre y estado actual del servidor;
- enlace para volver al dashboard;
- total de incidencias confirmadas;
- filtros por estado (`abierta` o `resuelta`), periodo y componente;
- una lista paginada de tarjetas de incidencia;
- estados de carga, lista vacía y error de consulta.

La consulta será de sólo lectura y excluirá incidencias `pending`. La API
ofrecerá un endpoint específico por servidor con `limit` y `offset`, además de
los filtros opcionales. La respuesta tendrá la forma:

```json
{
  "items": [],
  "total": 0,
  "limit": 20,
  "offset": 0
}
```

El backend validará que el servidor existe, limitará el tamaño de página y
aplicará los filtros antes de paginar. El historial no tendrá una retención
artificial: todos los errores confirmados almacenados podrán recorrerse por
páginas.

## Compatibilidad

El endpoint global de incidencias utilizado por el dashboard seguirá
funcionando. La pantalla nueva consumirá el endpoint específico del servidor.
No se requiere migrar las incidencias existentes: sus campos actuales bastan
para renderizar las tarjetas y la línea temporal.

## Pruebas

El backend cubrirá:

1. clasificación de warnings superiores y de componentes;
2. prioridad de error cuando conviven errores y warnings;
3. conservación del detalle de un check fallido dentro de una respuesta 500;
4. warning sin creación de incidencia ni notificación;
5. warning que descarta un pendiente;
6. warning que resuelve silenciosamente una incidencia abierta y no deja una
   recuperación pendiente;
7. histórico por servidor, paginación, filtros y servidor inexistente.

El frontend cubrirá:

1. badges y expansión automática para warning;
2. navegación desde el servidor a su histórico;
3. renderizado de incidencias abiertas, recuperadas y cerradas por warning;
4. filtros, paginación y estados vacío/error;
5. ausencia de warnings en el histórico de incidencias.

Las suites existentes del monitor, incidencias, Teams y dashboard deben seguir
pasando sin cambios de comportamiento para `ok` y `error`.
