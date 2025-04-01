const path = require('path');

/**
 * CalendarioLaboral module
 * 
 * This module provides functionality for managing employee work calendars,
 * including holidays, work schedules, and calendar configuration.
 */

// Module routes for the frontend
const routes = [
  {
    path: '/calendario/empleados',
    name: 'Gestión de Empleados',
    description: 'Administrar empleados y sus calendarios'
  },
  {
    path: '/calendario/festivos',
    name: 'Gestión de Festivos',
    description: 'Administrar los días festivos de los empleados'
  },
  {
    path: '/calendario/tipos',
    name: 'Tipos de Festivo',
    description: 'Configurar los tipos de festivos disponibles'
  },
  {
    path: '/calendario/configuracion',
    name: 'Calendario Anual',
    description: 'Configurar el calendario anual'
  }
];

/**
 * Initialize the module
 * @param {Express} app - The Express application instance
 * @param {sqlite3.Database} db - The SQLite database instance
 */
const initialize = (app, db) => {
  console.log('Initializing CalendarioLaboral module...');

  // Create database tables
  createTables(db);

  // Register API routes
  registerRoutes(app, db);

  console.log('CalendarioLaboral module initialized.');
};

/**
 * Create the required database tables
 * @param {sqlite3.Database} db - The SQLite database instance
 */
const createTables = (db) => {
  db.serialize(() => {
    // Empleados table - stores employee information
    db.run(`
      CREATE TABLE IF NOT EXISTS Empleados (
        username TEXT PRIMARY KEY,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE
      )
    `);

    // TipoFestivo table - stores holiday types
    db.run(`
      CREATE TABLE IF NOT EXISTS TipoFestivo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        isHoras INTEGER NOT NULL DEFAULT 0
      )
    `);

    // CalendarioAnual table - stores annual calendar configuration
    db.run(`
      CREATE TABLE IF NOT EXISTS CalendarioAnual (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipoFestivo INTEGER NOT NULL,
        cantidad INTEGER NOT NULL,
        ano INTEGER NOT NULL,
        FOREIGN KEY (tipoFestivo) REFERENCES TipoFestivo(id)
      )
    `);

    // empleado_festivos table - stores employee holidays
    db.run(`
      CREATE TABLE IF NOT EXISTS empleado_festivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        fecha DATE NOT NULL,
        fecha_fin DATE,
        tipo INTEGER NOT NULL,
        pendiente INTEGER NOT NULL DEFAULT 1,
        imputacion_ano INTEGER NOT NULL,
        FOREIGN KEY (username) REFERENCES Empleados(username),
        FOREIGN KEY (tipo) REFERENCES TipoFestivo(id)
      )
    `);
  });
};

/**
 * Register API routes for the module
 * @param {Express} app - The Express application instance
 * @param {sqlite3.Database} db - The SQLite database instance
 */
const registerRoutes = (app, db) => {
  // API endpoints for Empleados (Employees)
  registerEmpleadosRoutes(app, db);

  // API endpoints for TipoFestivo (Holiday Types)
  registerTipoFestivoRoutes(app, db);

  // API endpoints for CalendarioAnual (Annual Calendar)
  registerCalendarioAnualRoutes(app, db);

  // API endpoints for empleado_festivos (Employee Holidays)
  registerEmpleadoFestivosRoutes(app, db);

  // API endpoint to get employee status for the main page
  registerEmployeeStatusRoute(app, db);
};

/**
 * Register API routes for Empleados
 * @param {Express} app - The Express application instance
 * @param {sqlite3.Database} db - The SQLite database instance
 */
const registerEmpleadosRoutes = (app, db) => {
  // Get all employees
  app.get('/api/calendario/empleados', (req, res) => {
    db.all('SELECT * FROM Empleados', (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  });

  // Create a new employee
  app.post('/api/calendario/empleados', (req, res) => {
    const { username, fecha_inicio, fecha_fin } = req.body;

    if (!username || !fecha_inicio) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = 'INSERT INTO Empleados (username, fecha_inicio, fecha_fin) VALUES (?, ?, ?)';

    db.run(sql, [username, fecha_inicio, fecha_fin || null], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        username,
        fecha_inicio,
        fecha_fin
      });
    });
  });

  // Update an employee
  app.put('/api/calendario/empleados/:username', (req, res) => {
    const { username } = req.params;
    const { fecha_inicio, fecha_fin } = req.body;

    if (!fecha_inicio) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = 'UPDATE Empleados SET fecha_inicio = ?, fecha_fin = ? WHERE username = ?';

    db.run(sql, [fecha_inicio, fecha_fin || null, username], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      res.json({
        username,
        fecha_inicio,
        fecha_fin
      });
    });
  });

  // Delete an employee
  app.delete('/api/calendario/empleados/:username', (req, res) => {
    const { username } = req.params;

    db.run('DELETE FROM Empleados WHERE username = ?', [username], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      res.json({ message: 'Employee deleted successfully' });
    });
  });
};

/**
 * Register API routes for TipoFestivo
 * @param {Express} app - The Express application instance
 * @param {sqlite3.Database} db - The SQLite database instance
 */
const registerTipoFestivoRoutes = (app, db) => {
  // Get all holiday types
  app.get('/api/calendario/tipos', (req, res) => {
    db.all('SELECT * FROM TipoFestivo', (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  });

  // Create a new holiday type
  app.post('/api/calendario/tipos', (req, res) => {
    const { nombre, isHoras } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = 'INSERT INTO TipoFestivo (nombre, isHoras) VALUES (?, ?)';

    db.run(sql, [nombre, isHoras ? 1 : 0], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.get('SELECT * FROM TipoFestivo WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json(row);
      });
    });
  });

  // Update a holiday type
  app.put('/api/calendario/tipos/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, isHoras } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = 'UPDATE TipoFestivo SET nombre = ?, isHoras = ? WHERE id = ?';

    db.run(sql, [nombre, isHoras ? 1 : 0, id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Holiday type not found' });
      }

      db.get('SELECT * FROM TipoFestivo WHERE id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    });
  });

  // Delete a holiday type
  app.delete('/api/calendario/tipos/:id', (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM TipoFestivo WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Holiday type not found' });
      }

      res.json({ message: 'Holiday type deleted successfully' });
    });
  });
};

/**
 * Register API routes for CalendarioAnual
 * @param {Express} app - The Express application instance
 * @param {sqlite3.Database} db - The SQLite database instance
 */
const registerCalendarioAnualRoutes = (app, db) => {
  // Get annual calendar configuration
  app.get('/api/calendario/configuracion', (req, res) => {
    const { ano } = req.query;

    let sql = 'SELECT ca.*, tf.nombre, tf.isHoras FROM CalendarioAnual ca JOIN TipoFestivo tf ON ca.tipoFestivo = tf.id';
    const params = [];

    if (ano) {
      sql += ' WHERE ca.ano = ?';
      params.push(ano);
    }

    db.all(sql, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  });

  // Create a new annual calendar configuration
  app.post('/api/calendario/configuracion', (req, res) => {
    const { tipoFestivo, cantidad, ano } = req.body;

    if (!tipoFestivo || !cantidad || !ano) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = 'INSERT INTO CalendarioAnual (tipoFestivo, cantidad, ano) VALUES (?, ?, ?)';

    db.run(sql, [tipoFestivo, cantidad, ano], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.get('SELECT ca.*, tf.nombre, tf.isHoras FROM CalendarioAnual ca JOIN TipoFestivo tf ON ca.tipoFestivo = tf.id WHERE ca.id = ?', [this.lastID], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json(row);
      });
    });
  });

  // Update an annual calendar configuration
  app.put('/api/calendario/configuracion/:id', (req, res) => {
    const { id } = req.params;
    const { tipoFestivo, cantidad, ano } = req.body;

    if (!tipoFestivo || !cantidad || !ano) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = 'UPDATE CalendarioAnual SET tipoFestivo = ?, cantidad = ?, ano = ? WHERE id = ?';

    db.run(sql, [tipoFestivo, cantidad, ano, id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Calendar configuration not found' });
      }

      db.get('SELECT ca.*, tf.nombre, tf.isHoras FROM CalendarioAnual ca JOIN TipoFestivo tf ON ca.tipoFestivo = tf.id WHERE ca.id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    });
  });

  // Delete an annual calendar configuration
  app.delete('/api/calendario/configuracion/:id', (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM CalendarioAnual WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Calendar configuration not found' });
      }

      res.json({ message: 'Calendar configuration deleted successfully' });
    });
  });
};

/**
 * Register API routes for empleado_festivos
 * @param {Express} app - The Express application instance
 * @param {sqlite3.Database} db - The SQLite database instance
 */
const registerEmpleadoFestivosRoutes = (app, db) => {
  // Get employee holidays
  app.get('/api/calendario/festivos', (req, res) => {
    const { username, fecha, tipo, ano } = req.query;

    let sql = `
      SELECT ef.*, e.username as empleado_nombre, tf.nombre as tipo_nombre, tf.isHoras 
      FROM empleado_festivos ef
      JOIN Empleados e ON ef.username = e.username
      JOIN TipoFestivo tf ON ef.tipo = tf.id
    `;

    const conditions = [];
    const params = [];

    if (username) {
      conditions.push('ef.username = ?');
      params.push(username);
    }

    if (fecha) {
      conditions.push('ef.fecha = ?');
      params.push(fecha);
    }

    if (tipo) {
      conditions.push('ef.tipo = ?');
      params.push(tipo);
    }

    if (ano) {
      conditions.push('ef.imputacion_ano = ?');
      params.push(ano);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    db.all(sql, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  });

  // Create a new employee holiday
  app.post('/api/calendario/festivos', (req, res) => {
    const { username, fecha, fecha_fin, tipo, imputacion_ano } = req.body;

    if (!username || !fecha || !tipo || !imputacion_ano) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // If fecha_fin is provided, ensure it's not before fecha
    if (fecha_fin && fecha_fin < fecha) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }

    // Check if the employee exists
    db.get('SELECT * FROM Empleados WHERE username = ?', [username], (err, employee) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Check if the holiday type exists
      db.get('SELECT * FROM TipoFestivo WHERE id = ?', [tipo], (err, tipoFestivo) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        if (!tipoFestivo) {
          return res.status(404).json({ error: 'Holiday type not found' });
        }

        // Check if the employee has already used all their holidays of this type for the year
        db.all(
          `SELECT fecha, fecha_fin FROM empleado_festivos WHERE username = ? AND tipo = ? AND imputacion_ano = ?`,
          [username, tipo, imputacion_ano],
          (err, holidays) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }

            // Calculate total days used
            let daysUsed = 0;
            for (const holiday of holidays) {
              if (holiday.fecha_fin) {
                // Calculate days in period (inclusive of start and end dates)
                const startDate = new Date(holiday.fecha);
                const endDate = new Date(holiday.fecha_fin);
                const diffTime = Math.abs(endDate - startDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                daysUsed += diffDays;
              } else {
                // Single day
                daysUsed += 1;
              }
            }

            // Calculate days in new period
            let newDays = 1; // Default to 1 for single day
            if (fecha_fin) {
              const startDate = new Date(fecha);
              const endDate = new Date(fecha_fin);
              const diffTime = Math.abs(endDate - startDate);
              newDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            }

            // Get the allowed amount for this holiday type and year
            db.get(
              `SELECT cantidad FROM CalendarioAnual WHERE tipoFestivo = ? AND ano = ?`,
              [tipo, imputacion_ano],
              (err, calendarRow) => {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }

                if (!calendarRow) {
                  return res.status(404).json({ error: 'Calendar configuration not found for this year and holiday type' });
                }

                if (daysUsed + newDays > calendarRow.cantidad) {
                  return res.status(400).json({ 
                    error: `Employee has already used or would exceed their allowed holidays of this type for the year. Remaining days: ${calendarRow.cantidad - daysUsed}`,
                    daysUsed: daysUsed,
                    newDays: newDays,
                    allowed: calendarRow.cantidad,
                    remaining: calendarRow.cantidad - daysUsed
                  });
                }

                // Insert the holiday
                const sql = `
                  INSERT INTO empleado_festivos (username, fecha, fecha_fin, tipo, pendiente, imputacion_ano)
                  VALUES (?, ?, ?, ?, ?, ?)
                `;

                db.run(sql, [username, fecha, fecha_fin || null, tipo, 1, imputacion_ano], function(err) {
                  if (err) {
                    return res.status(500).json({ error: err.message });
                  }

                  db.get('SELECT * FROM empleado_festivos WHERE id = ?', [this.lastID], (err, row) => {
                    if (err) {
                      return res.status(500).json({ error: err.message });
                    }
                    res.status(201).json(row);
                  });
                });
              }
            );
          }
        );
      });
    });
  });

  // Update an employee holiday
  app.put('/api/calendario/festivos/:id', (req, res) => {
    const { id } = req.params;
    const { fecha, fecha_fin, tipo, pendiente, imputacion_ano } = req.body;

    if (!fecha || !tipo || pendiente === undefined || !imputacion_ano) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // If fecha_fin is provided, ensure it's not before fecha
    if (fecha_fin && fecha_fin < fecha) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }

    // Check if the holiday exists
    db.get('SELECT * FROM empleado_festivos WHERE id = ?', [id], (err, holiday) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!holiday) {
        return res.status(404).json({ error: 'Holiday not found' });
      }

      // If changing the type, year, or dates, check if the employee has already used all their holidays of this type for the year
      if (holiday.tipo !== tipo || holiday.imputacion_ano !== imputacion_ano || 
          holiday.fecha !== fecha || holiday.fecha_fin !== fecha_fin) {
        db.all(
          `SELECT fecha, fecha_fin FROM empleado_festivos WHERE username = ? AND tipo = ? AND imputacion_ano = ? AND id != ?`,
          [holiday.username, tipo, imputacion_ano, id],
          (err, holidays) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }

            // Calculate total days used
            let daysUsed = 0;
            for (const h of holidays) {
              if (h.fecha_fin) {
                // Calculate days in period (inclusive of start and end dates)
                const startDate = new Date(h.fecha);
                const endDate = new Date(h.fecha_fin);
                const diffTime = Math.abs(endDate - startDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                daysUsed += diffDays;
              } else {
                // Single day
                daysUsed += 1;
              }
            }

            // Calculate days in new period
            let newDays = 1; // Default to 1 for single day
            if (fecha_fin) {
              const startDate = new Date(fecha);
              const endDate = new Date(fecha_fin);
              const diffTime = Math.abs(endDate - startDate);
              newDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            }

            // Get the allowed amount for this holiday type and year
            db.get(
              `SELECT cantidad FROM CalendarioAnual WHERE tipoFestivo = ? AND ano = ?`,
              [tipo, imputacion_ano],
              (err, calendarRow) => {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }

                if (!calendarRow) {
                  return res.status(404).json({ error: 'Calendar configuration not found for this year and holiday type' });
                }

                if (daysUsed + newDays > calendarRow.cantidad) {
                  return res.status(400).json({ 
                    error: `Employee has already used or would exceed their allowed holidays of this type for the year. Remaining days: ${calendarRow.cantidad - daysUsed}`,
                    daysUsed: daysUsed,
                    newDays: newDays,
                    allowed: calendarRow.cantidad,
                    remaining: calendarRow.cantidad - daysUsed
                  });
                }

                updateHoliday();
              }
            );
          }
        );
      } else {
        updateHoliday();
      }

      function updateHoliday() {
        const sql = `
          UPDATE empleado_festivos 
          SET fecha = ?, fecha_fin = ?, tipo = ?, pendiente = ?, imputacion_ano = ?
          WHERE id = ?
        `;

        db.run(sql, [fecha, fecha_fin || null, tipo, pendiente, imputacion_ano, id], function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Holiday not found' });
          }

          db.get('SELECT * FROM empleado_festivos WHERE id = ?', [id], (err, row) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json(row);
          });
        });
      }
    });
  });

  // Delete an employee holiday
  app.delete('/api/calendario/festivos/:id', (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM empleado_festivos WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Holiday not found' });
      }

      res.json({ message: 'Holiday deleted successfully' });
    });
  });
};

/**
 * Register API endpoint to get employee status for the main page
 * @param {Express} app - The Express application instance
 * @param {sqlite3.Database} db - The SQLite database instance
 */
const registerEmployeeStatusRoute = (app, db) => {
  app.get('/api/calendario/status', (req, res) => {
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // Get all active employees (fecha_fin is null or greater than today)
    const sql = `
      SELECT e.username, e.fecha_inicio, e.fecha_fin,
        (SELECT COUNT(*) FROM empleado_festivos ef 
         WHERE ef.username = e.username AND ef.pendiente = 1 AND 
         (ef.fecha = ? OR (ef.fecha <= ? AND ef.fecha_fin >= ?))) as has_holiday,
        (SELECT tf.isHoras FROM empleado_festivos ef 
         JOIN TipoFestivo tf ON ef.tipo = tf.id
         WHERE ef.username = e.username AND ef.pendiente = 1 AND 
         (ef.fecha = ? OR (ef.fecha <= ? AND ef.fecha_fin >= ?))
         LIMIT 1) as is_hours
      FROM Empleados e
      WHERE e.fecha_fin IS NULL OR e.fecha_fin >= ?
    `;

    db.all(sql, [today, today, today, today, today, today, today], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // Transform the results to include status
      const employeeStatus = rows.map(row => ({
        username: row.username,
        fecha_inicio: row.fecha_inicio,
        fecha_fin: row.fecha_fin,
        status: row.has_holiday > 0 
          ? (row.is_hours === 1 ? 'partial' : 'off') 
          : 'working'
      }));

      res.json(employeeStatus);
    });
  });
};

// Export module functions
module.exports = {
  initialize,
  routes
};
