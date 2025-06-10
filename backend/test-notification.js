const { exec } = require('child_process');

// Function to send Windows notification
const sendWindowsNotification = (title, message) => {
  // Escape single quotes for PowerShell
  const escapedMessage = message.replace(/'/g, "''");
  const escapedTitle = title.replace(/'/g, "''");

  // Windows 10 Toast Notification PowerShell command
  const command = `powershell -Command "& {[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; $template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02; $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template); $xml.GetElementsByTagName('text')[0].InnerText = '${escapedTitle}'; $xml.GetElementsByTagName('text')[1].InnerText = '${escapedMessage}'; $toast = [Windows.UI.Notifications.ToastNotification]::new($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Gestor de Enlaces').Show($toast);}"`;

  exec(command, (error) => {
    if (error) {
      console.error('Error sending notification:', error);
      console.log(`NOTIFICATION: ${title} - ${message}`);
    } else {
      console.log('Notification sent successfully!');
    }
  });
};

// Test the notification
sendWindowsNotification('Servidor Test: Estado', 'Este es un ejemplo del nuevo formato de notificaciones para Gestor de Enlaces.');

console.log('Attempting to send a Windows notification...');
