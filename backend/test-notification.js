const { sendSystemNotification } = require('./notify');

// Manual test for the desktop notification helper.
sendSystemNotification(
  'Servidor Test: Estado',
  'Este es un ejemplo del nuevo formato de notificaciones para Gestor de Enlaces.'
);

console.log('Attempting to send a system notification...');
