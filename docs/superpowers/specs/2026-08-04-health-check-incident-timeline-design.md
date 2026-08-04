# Histórico por check con mensajes de diagnóstico

## Objetivo

Hacer que cada tramo amarillo o rojo del estado de 24 horas pueda explicarse
después desde el histórico. El dashboard seguirá mostrando únicamente los
checks que tienen un problema actual, mientras que el histórico registrará un
episodio independiente por check y conservará los mensajes reales recibidos en
`errors[]`.

Este diseño sustituye las reglas de persistencia y presentación histórica de
warnings descritas en
`2026-08-04-health-warnings-incident-history-design.md`. No modifica las reglas
de Teams de aquel diseño.

## Comportamiento aprobado

### Página de servicios

Cada servidor mantiene su fila compacta y la línea de estado de 24 horas.
Debajo de la línea se muestran solamente los componentes cuyo último resultado
sea `error` o `warning`:

- si falla un check, se muestra su bloque de diagnóstico;
- si fallan varios, se muestran todos como bloques independientes;
- cada bloque conserva el nombre del check, su severidad, los mensajes de
  `errors[]` y la información técnica disponible en `info`;
- los checks `ok` permanecen ocultos.

No se añade un segundo histórico ni un desplegable con todos los checks. La
fotografía actual y el histórico continúan siendo conceptos separados.

### Página de histórico

El histórico registra un episodio independiente por servidor y check. Si `db`
y `db2` tienen problemas, aparecen dos tarjetas distintas, aunque sus periodos
se solapen.

Una tarjeta conserva el aspecto actual de incidencia y contiene una línea
temporal:

1. `Error detectado` o `Aviso detectado`, con fecha, severidad y todos los
   mensajes de `errors[]` de la primera observación.
2. Cero o más entradas `Actualización`, cada una con su fecha, color y mensajes.
3. `Servicio recuperado` cuando el check vuelve a `ok`.

El texto agregado `Components failed: db` deja de ser el diagnóstico principal.
Se usa el contenido real de `errors[]`. Si una respuesta no aporta ningún
mensaje, se muestra un fallback explícito (`El check no devolvió detalle del
problema`) en vez del resumen agregado.

Las tarjetas amarillas son registros informativos. Sirven para explicar los
tramos amarillos de la línea de 24 horas y analizar si un control merece
promoverse a error, pero nunca generan mensajes de Teams.

## Reglas de episodios por check

Un episodio representa un periodo continuo durante el que un check no está en
`ok`.

- La primera observación `error` o `warning` abre inmediatamente un episodio
  para ese check. Esta persistencia histórica es independiente del umbral de
  confirmación usado por Teams.
- Una observación posterior del mismo check mantiene abierto el episodio.
- Cuando el check vuelve explícitamente a `ok`, se añade el evento de
  recuperación y se cierra el episodio.
- Cada check evoluciona de forma independiente. La recuperación de `db` no
  cierra ni modifica la incidencia abierta de `db2`.
- Si el servidor no puede consultarse y no existe un payload estructurado de
  componentes, se registra un episodio reservado de tipo `Conexión`. No se
  cierran silenciosamente los episodios de componentes porque su estado es
  desconocido.
- Si un servidor monitorizado se elimina, sus episodios abiertos se cierran con
  el motivo técnico `monitor_removed`; la interfaz no lo presenta como una
  recuperación comprobada.

Los warnings abren y mantienen episodios históricos, pero no participan en la
máquina de notificaciones. El paso de warning a error, o de error a warning,
actualiza la severidad actual de la tarjeta sin enviar Teams.

## Mensajes y deduplicación

Para cada componente se extraen los textos de `errors[]`. Se aceptan tanto
cadenas como objetos con propiedad `message`. Antes de comparar se:

- eliminan valores vacíos y duplicados;
- recortan espacios exteriores;
- ignora el orden del array para evitar actualizaciones falsas.

La firma resultante representa el conjunto de mensajes de esa observación.
Sólo se añade una entrada `Actualización` cuando la firma difiere de la última
guardada para el episodio. Repetir el mismo mensaje en comprobaciones sucesivas
incrementa el número de observaciones, pero no añade ruido a la línea temporal.

Un cambio de severidad con los mismos mensajes actualiza el estado actual del
episodio, pero no crea una entrada, porque la regla aprobada de deduplicación se
basa en el mensaje. La siguiente actualización con texto diferente usa el color
de la severidad que tenga en ese momento.

Cuando una observación contiene varios mensajes, se almacenan y muestran juntos
en el mismo evento como una lista; no se crean eventos separados por cada texto.

## Persistencia y aislamiento de Teams

La persistencia del histórico por check se separa del estado agregado que usa
el monitor para confirmar fallos y enviar Teams. Así se puede registrar un
warning o un único error transitorio sin alterar el umbral, los recordatorios o
las recuperaciones existentes.

Se añaden dos tablas:

### `health_component_incidents`

Una fila por episodio de servidor y check, con:

- identificador, servidor, clave y nombre visible del componente;
- estado `open` o `resolved`, severidad actual y mayor severidad observada;
- primera y última observación, fecha de resolución y motivo de cierre;
- número total de observaciones no `ok`;
- firma del último conjunto de mensajes;
- referencia opcional a una incidencia antigua migrada.

Un índice único parcial impide más de un episodio abierto para la misma pareja
`server_id` y `component_key`.

### `health_component_incident_events`

Una fila por hito visible, con:

- incidencia propietaria;
- tipo `detected`, `update` o `recovered`;
- fecha y severidad de la observación;
- mensajes serializados como array.

La escritura del snapshot actual, la línea comprimida de 24 horas, la máquina
agregada de incidencias y el envío a Teams mantienen sus contratos actuales.
El registrador por componente consume el mismo resultado del checker como una
operación adicional y aislada.

## Compatibilidad de datos existentes

Las incidencias antiguas no contienen el contenido completo de `errors[]`, por
lo que ese detalle no puede reconstruirse. Una migración idempotente crea un
episodio por cada componente listado en `last_error.components` y conserva:

- fechas de detección y resolución;
- estado abierto o resuelto;
- número de fallos;
- el resumen antiguo como mensaje heredado.

Las entradas migradas pueden seguir mostrando `Components failed: ...`; sólo
afecta a datos anteriores al despliegue. Todas las observaciones nuevas guardan
el diagnóstico real. La referencia única a la incidencia de origen evita
duplicados si la inicialización se ejecuta varias veces.

## API

El endpoint por servidor conserva su ruta, paginación y filtros actuales:

`GET /api/health/servers/:serverId/incidents`

Cada elemento pasa a representar un episodio por check e incluye `events`
ordenados cronológicamente. Se mantienen los filtros de estado, periodo y
componente. La respuesta sigue usando `items`, `total`, `limit` y `offset`, de
modo que la página no necesita un segundo flujo de carga.

Los eventos se consultan únicamente para las incidencias de la página actual y
se agrupan en el repositorio antes de responder. El backend sigue limitando el
tamaño máximo de página.

## Presentación

La tarjeta histórica conserva su jerarquía actual:

- `Incidencia de db` si el episodio llegó a error, o `Aviso de db` si sólo
  registró warnings;
- badge de estado actual o resuelto;
- línea temporal vertical con rojo para error, ámbar para warning y verde para
  recuperación;
- mensajes debajo de la fecha de cada evento;
- pie con número de observaciones y duración total.

Una tarjeta que empezó como warning y escaló a error adopta el título y el
estado visual de la mayor severidad observada, aunque sus eventos mantienen el
color que les corresponde. El color siempre se acompaña de texto para no ser
la única señal.

El banner genérico situado actualmente encima de la línea temporal se elimina,
porque el diagnóstico pasa a estar unido al evento exacto que lo produjo.

## Fallos y consistencia

- Un error al escribir el histórico no debe impedir actualizar el snapshot ni
  ejecutar la lógica de Teams; se registra como degradación del monitor.
- La creación o actualización de un episodio y su evento se realiza dentro de
  una transacción para evitar una tarjeta sin cronología.
- Las respuestas de red sin componentes usan el episodio `Conexión` y el
  mensaje de transporte disponible.
- El frontend tolera incidencias heredadas sin `events` mediante la
  representación anterior, necesaria durante la migración y para respuestas
  antiguas en caché.

## Pruebas

El backend cubrirá:

1. apertura inmediata e independiente de episodios para dos componentes;
2. persistencia de warnings sin notificaciones a Teams;
3. mensajes de `errors[]`, incluidos varios mensajes en una observación;
4. ausencia de actualización cuando se repite el mismo conjunto de mensajes;
5. creación de actualización cuando cambia el conjunto de mensajes;
6. cambio de severidad sin alterar las reglas de Teams;
7. recuperación independiente de cada componente;
8. error de conexión sin cerrar componentes cuyo estado se desconoce;
9. migración idempotente de incidencias antiguas;
10. paginación y filtros sobre episodios por check.

El frontend cubrirá:

1. listado de todos los checks actuales en error o warning y omisión de `ok`;
2. tarjeta roja y tarjeta amarilla por check;
3. renderizado cronológico de detección, actualizaciones y recuperación;
4. presentación conjunta de varios mensajes en un evento;
5. eliminación del banner `Components failed: ...` para datos nuevos;
6. fallback compatible para incidencias antiguas sin eventos;
7. accesibilidad textual de estados y colores.

Las suites existentes de checker, monitor, Teams, historial de 24 horas y
dashboard deben seguir pasando. La verificación visual incluirá escritorio y
móvil para confirmar que los mensajes largos no introducen desbordamiento
horizontal.

## Fuera de alcance

- comentarios manuales de operadores;
- consulta directa de la tabla externa que origina algunos warnings;
- configuración de qué warnings deben convertirse en errores;
- cambios en destinatarios, umbrales o contenido de Teams;
- retención o borrado automático del histórico.
