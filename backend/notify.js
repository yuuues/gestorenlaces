const { execFile } = require('child_process');

// PowerShell toast script. Reads its text from environment variables so the
// (user-controlled) title/message are never interpolated into the command
// string or parsed by a shell — this prevents command injection.
const WIN_TOAST_SCRIPT = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template)
$xml.GetElementsByTagName('text')[0].InnerText = $env:NOTIF_TITLE
$xml.GetElementsByTagName('text')[1].InnerText = $env:NOTIF_MESSAGE
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Gestor de Enlaces').Show($toast)
`;

// Send a cross-platform desktop notification.
// - Windows: PowerShell toast notification.
// - Linux:   notify-send (falls back to console if unavailable).
// - Other:   console log.
// Values are passed as argument arrays / env vars (no shell), and any failure
// falls back to a console log so notifications never crash callers.
const sendSystemNotification = (title, message) => {
  if (process.platform === 'win32') {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', WIN_TOAST_SCRIPT],
      { env: { ...process.env, NOTIF_TITLE: title, NOTIF_MESSAGE: message } },
      (error) => {
        if (error) {
          console.error('Error sending Windows notification:', error);
          console.log(`NOTIFICATION: ${title} - ${message}`);
        }
      }
    );
  } else if (process.platform === 'linux') {
    execFile('notify-send', [title, message], (error) => {
      if (error) {
        // Silent fallback to console log (often headless or missing notify-send)
        console.log(`NOTIFICATION: ${title} - ${message}`);
      }
    });
  } else {
    console.log(`NOTIFICATION: ${title} - ${message}`);
  }
};

module.exports = { sendSystemNotification };
