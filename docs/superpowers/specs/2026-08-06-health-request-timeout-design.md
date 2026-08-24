# Timeout de validación de servidores a 10 segundos

## Objetivo

Ampliar de 5 a 10 segundos el tiempo máximo de cada petición realizada por el
monitor de salud, manteniendo el valor configurable mediante
`HEALTH_REQUEST_TIMEOUT_MS`.

## Diseño

- El valor predeterminado de `HEALTH_REQUEST_TIMEOUT_MS` será `10000` ms.
- La configuración local y el fichero de ejemplo usarán también `10000` ms.
- El monitor seguirá pasando el valor configurado a cada comprobación.
- Las comprobaciones de una misma ronda seguirán iniciándose en paralelo con
  `Promise.all`; el cambio no altera su concurrencia ni la frecuencia de las
  rondas.
- La documentación describirá el nuevo valor predeterminado.

## Compatibilidad y errores

La variable de entorno seguirá aceptando cualquier entero positivo. Si falta,
se usarán 10 segundos; si contiene un valor inválido, se registrará el aviso
existente y se aplicará ese mismo valor predeterminado.

## Pruebas

- Una prueba de configuración demostrará primero que el fallback actual de 5
  segundos incumple el nuevo requisito y después verificará 10 segundos.
- Las pruebas existentes confirmarán que un valor explícito continúa
  propagándose sin cambios y que las comprobaciones siguen siendo concurrentes.
- Se ejecutará la suite completa del backend después del cambio.
