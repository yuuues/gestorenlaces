const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Store last notification times for each server
const lastNotificationTimes = {};

// Function to send system notification
const sendSystemNotification = (title, message) => {
  // Use PowerShell to display a Windows notification
  const escapedMessage = message.replace(/'/g, "''");
  const escapedTitle = title.replace(/'/g, "''");
  const command = `powershell -Command "& {[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; $template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02; $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template); $xml.GetElementsByTagName('text')[0].InnerText = '${escapedTitle}'; $xml.GetElementsByTagName('text')[1].InnerText = '${escapedMessage}'; $toast = [Windows.UI.Notifications.ToastNotification]::new($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Gestor de Enlaces').Show($toast);}"`;

  exec(command, (error) => {
    if (error) {
      console.error('Error sending notification:', error);
      // Fallback to console log if notification fails
      console.log(`NOTIFICATION: ${title} - ${message}`);
    }
  });
};

// Initialize the health module
exports.initialize = (app, db) => {
  console.log('Initializing health module...');

  // Create servers table if it doesn't exist
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        description TEXT
      )
    `);
  });

  // Load servers from JSON if table is empty
  loadServersFromJson(db);

  // Register routes
  registerRoutes(app, db);

  console.log('Health module initialized successfully.');
};

// Load servers from JSON file
const loadServersFromJson = (db) => {
  db.get('SELECT COUNT(*) as count FROM servers', (err, row) => {
    if (err) {
      console.error('Error checking servers table:', err);
      return;
    }

    // If table is empty, import from JSON
    if (row.count === 0) {
      const jsonPath = path.join(__dirname, '..', '..', '..', 'json', 'servers.json');

      if (fs.existsSync(jsonPath)) {
        try {
          const serversData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          const stmt = db.prepare('INSERT INTO servers (name, url, description) VALUES (?, ?, ?)');

          serversData.forEach(server => {
            stmt.run(
              server.name,
              server.url,
              server.description || ''
            );
          });

          stmt.finalize();
          console.log('Servers loaded from JSON file.');
        } catch (error) {
          console.error('Error importing servers from JSON:', error);
        }
      } else {
        console.log('Servers JSON file not found.');
      }
    } else {
      console.log('Servers table already has data.');
    }
  });
};

// Register API routes
const registerRoutes = (app, db) => {
  // Get all servers
  app.get('/api/health/servers', (req, res) => {
    db.all('SELECT * FROM servers', (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  });

  // Check health of all servers
  app.get('/api/health/check', async (req, res) => {
    try {
      // Get all servers from database
      db.all('SELECT * FROM servers', async (err, servers) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const results = {};
        const currentTime = Date.now();
        const minTimeBetweenNotifications = 300 * 1000; // 300 seconds in milliseconds

        // Check each server
        for (const server of servers) {
          try {
            const response = await checkServerHealth(server.url);
            results[server.name] = {
              name: server.name,
              status: response.status === 200 ? 'ok' : 'error',
              components: response.data ? (response.data.components || response.data) : {},
              info: {
                url: server.url,
                connection: `Conexión validada y recibido codigo ${response.status} ${response.status === 200 ? 'ok' : 'error'}!`
              }
            };

            // If status is error, send notification if enough time has passed
            if (response.status !== 200) {
              const lastNotificationTime = lastNotificationTimes[server.name] || 0;
              if (currentTime - lastNotificationTime >= minTimeBetweenNotifications) {
                sendSystemNotification(
                  `${server.name}: Error de Salud`,
                  `El servidor ha devuelto un código de error: ${response.status}`
                );
                lastNotificationTimes[server.name] = currentTime;
              }
            }
          } catch (error) {
            results[server.name] = {
              name: server.name,
              status: 'error',
              components: {},
              info: {
                url: server.url,
                connection: `Error de conexión: ${error.message}`
              },
              errors: [error.message]
            };

            // Send notification for connection error if enough time has passed
            const lastNotificationTime = lastNotificationTimes[server.name] || 0;
            if (currentTime - lastNotificationTime >= minTimeBetweenNotifications) {
              sendSystemNotification(
                `${server.name}: Error de Conexión`,
                `Error al conectar con el servidor: ${error.message}`
              );
              lastNotificationTimes[server.name] = currentTime;
            }
          }
        }

        res.json(results);
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add a new server
  app.post('/api/health/servers', (req, res) => {
    const { name, url, description } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    const sql = 'INSERT INTO servers (name, url, description) VALUES (?, ?, ?)';
    db.run(sql, [name, url, description || ''], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.get('SELECT * FROM servers WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json(row);
      });
    });
  });

  // Update a server
  app.put('/api/health/servers/:id', (req, res) => {
    const { id } = req.params;
    const { name, url, description } = req.body;

    db.get('SELECT * FROM servers WHERE id = ?', [id], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!row) {
        return res.status(404).json({ error: 'Server not found' });
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (url !== undefined) updates.url = url;
      if (description !== undefined) updates.description = description;

      const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);

      if (values.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const sql = `UPDATE servers SET ${fields} WHERE id = ?`;

      db.run(sql, [...values, id], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        db.get('SELECT * FROM servers WHERE id = ?', [id], (err, row) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json(row);
        });
      });
    });
  });

  // Delete a server
  app.delete('/api/health/servers/:id', (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM servers WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Server not found' });
      }

      res.json({ message: 'Server deleted successfully' });
    });
  });
};

// Function to check server health
const checkServerHealth = async (url) => {
  try {
    const response = await axios.get(url, { timeout: 5000 });
    return response;
  } catch (error) {
    throw error;
  }
};

// Export routes for module info
exports.routes = [
  { path: '/api/health/servers', methods: ['GET', 'POST'] },
  { path: '/api/health/servers/:id', methods: ['PUT', 'DELETE'] },
  { path: '/api/health/check', methods: ['GET'] }
];
