const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { sendSystemNotification } = require('../../notify');
const { requireAuth } = require('../../auth');
const schema = require('../../schema');

// Store last notification times for each server
const lastNotificationTimes = {};

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

  // Reconcile columns added in later versions before seeding, then load servers
  // from JSON if the table is empty.
  schema.ensureColumns(db, 'servers', [{ name: 'description', definition: 'TEXT' }])
    .catch((err) => console.error('Schema reconcile (servers) failed:', err))
    .finally(() => loadServersFromJson(db));

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

        const currentTime = Date.now();
        const minTimeBetweenNotifications = 300 * 1000; // 300 seconds in milliseconds

        // Only notify about a server's error state once per interval.
        const notifyOnce = (serverName, title, message) => {
          const lastNotificationTime = lastNotificationTimes[serverName] || 0;
          if (currentTime - lastNotificationTime >= minTimeBetweenNotifications) {
            sendSystemNotification(title, message);
            lastNotificationTimes[serverName] = currentTime;
          }
        };

        // Check all servers concurrently so total time is bounded by the
        // slowest server, not the sum of all of them.
        const checkOne = async (server) => {
          try {
            const response = await checkServerHealth(server.url);
            const isOk = response.status === 200;
            const data = response.data || {};

            const entry = {
              name: server.name,
              status: isOk ? 'ok' : 'error',
              components: data.components || (data.status ? data : {}),
              info: {
                url: server.url,
                connection: isOk
                  ? `Conexión validada y recibido código ${response.status} ok!`
                  : `Servidor respondió con código ${response.status}, posiblemente con errores en componentes.`
              }
            };

            // If status is error, send notification if enough time has passed
            if (!isOk) {
              // Collect detailed error message from components if available
              let detail = '';
              if (data.components) {
                const errorComponents = Object.values(data.components)
                  .filter(c => c.status !== 'ok')
                  .map(c => c.name || 'Componente desconocido');
                if (errorComponents.length > 0) {
                  detail = ` Componentes en error: ${errorComponents.join(', ')}`;
                }
              }

              notifyOnce(
                server.name,
                `${server.name}: Estado Crítico`,
                `El servidor ha devuelto un código de error: ${response.status}.${detail}`
              );
            }

            return [server.name, entry];
          } catch (error) {
            notifyOnce(
              server.name,
              `${server.name}: Error de Conexión`,
              `Error al conectar con el servidor: ${error.message}`
            );

            return [server.name, {
              name: server.name,
              status: 'error',
              components: {},
              info: {
                url: server.url,
                connection: `Error de conexión: ${error.message}`
              },
              errors: [error.message]
            }];
          }
        };

        const entries = await Promise.all(servers.map(checkOne));
        res.json(Object.fromEntries(entries));
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add a new server
  app.post('/api/health/servers', requireAuth, (req, res) => {
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
  app.put('/api/health/servers/:id', requireAuth, (req, res) => {
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
  app.delete('/api/health/servers/:id', requireAuth, (req, res) => {
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
  // Accept any HTTP status without throwing: this is a health monitor, so a
  // 4xx/5xx is a valid "response received" that we classify ourselves (only
  // 200 counts as ok). Network errors (timeout, DNS, refused) still throw.
  return axios.get(url, {
    timeout: 5000,
    validateStatus: () => true
  });
};

// Export routes for module info
exports.routes = [
  { path: '/api/health/servers', methods: ['GET', 'POST'] },
  { path: '/api/health/servers/:id', methods: ['PUT', 'DELETE'] },
  { path: '/api/health/check', methods: ['GET'] }
];
