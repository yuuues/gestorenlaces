# Detalle de incidencias en Server Health

## Objetivo

Ampliar el resumen de cada incidencia de `Server Health` para que permita
identificar cuándo comenzó y terminó el problema y, cuando corresponda, qué
subcheck falló.

## Alcance

El cambio se limita al componente frontend `ServerHealth`. La API ya devuelve
los datos necesarios en cada incidencia:

- `first_failed_at`: inicio del fallo.
- `resolved_at`: fin de una incidencia resuelta.
- `last_error.components`: nombres de los subchecks afectados.

No se modifica el esquema de SQLite, la persistencia de incidencias ni los
endpoints del módulo Health.

## Presentación

El resumen de incidencia conservará:

- el título `Incidencia abierta` o `Última incidencia resuelta`;
- el último mensaje de error;
- el número de fallos consecutivos;
- la duración calculada.

Además mostrará líneas etiquetadas:

- **Inicio:** fecha y hora de `first_failed_at`, usando el formato local español
  ya empleado por la vista.
- **Fin:** fecha y hora de `resolved_at` en incidencias resueltas; `En curso` en
  incidencias abiertas.
- **Subcheck:** lista de nombres de `last_error.components`, separada por comas.

La línea **Subcheck** se renderizará únicamente cuando
`last_error.components` sea un array no vacío. Los timeouts, errores de red y
otros fallos sin un componente identificado no mostrarán esa línea.

## Comportamiento ante datos incompletos

La vista seguirá usando el formateador existente de timestamps. Si falta la
hora de inicio o su valor no puede interpretarse, se mostrará el fallback que
ya utiliza la interfaz. Una incidencia abierta nunca inventará una hora de fin:
mostrará `En curso`.

## Pruebas

Las pruebas del componente cubrirán:

1. Una incidencia abierta muestra inicio, `Fin: En curso` y el subcheck fallido.
2. Una incidencia resuelta muestra las horas de inicio y fin y el último
   subcheck fallido.
3. Una incidencia sin componentes afectados no muestra la etiqueta
   `Subcheck`.

Las comprobaciones existentes del mensaje, contador de fallos y duración deben
seguir pasando.
