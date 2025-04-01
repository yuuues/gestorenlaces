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
    const { username, fecha, tipo, imputacion_ano } = req.body;
    
    if (!username || !fecha || !tipo || !imputacion_ano) {
      return res.status(400).json({ error: 'Missing required fields' });
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
        db.get(
          `SELECT COUNT(*) as count FROM empleado_festivos WHERE username = ? AND tipo = ? AND imputacion_ano = ?`,
          [username, tipo, imputacion_ano],
          (err, countRow) => {
            if (err) {
              return res.status(500).json({ error: err.message });
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
                
                if (countRow.count >= calendarRow.cantidad) {
                  return res.status(400).json({ 
                    error: 'Employee has already used all their holidays of this type for the year',
                    count: countRow.count,
                    allowed: calendarRow.cantidad
                  });
                }
                
                // Insert the holiday
                const sql = `
                  INSERT INTO empleado_festivos (username, fecha, tipo, pendiente, imputacion_ano)
                  VALUES (?, ?, ?, ?, ?)
                `;
                
                db.run(sql, [username, fecha, tipo, 1, imputacion_ano], function(err) {
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
    const { fecha, tipo, pendiente, imputacion_ano } = req.body;
    
    if (!fecha || !tipo || pendiente === undefined || !imputacion_ano) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if the holiday exists
    db.get('SELECT * FROM empleado_festivos WHERE id = ?', [id], (err, holiday) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (!holiday) {
        return res.status(404).json({ error: 'Holiday not found' });
      }
      
      // If changing the type or year, check if the employee has already used all their holidays of this type for the year
      if (holiday.tipo !== tipo || holiday.imputacion_ano !== imputacion_ano) {
        db.get(
          `SELECT COUNT(*) as count FROM empleado_festivos WHERE username = ? AND tipo = ? AND imputacion_ano = ? AND id != ?`,
          [holiday.username, tipo, imputacion_ano, id],
          (err, countRow) => {
            if (err) {
              return res.status(500).json({ error: err.message });
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
                
                if (countRow.count >= calendarRow.cantidad) {
                  return res.status(400).json({ 
                    error: 'Employee has already used all their holidays of this type for the year',
                    count: countRow.count,
                    allowed: calendarRow.cantidad
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
          SET fecha = ?, tipo = ?, pendiente = ?, imputacion_ano = ?
          WHERE id = ?
        `;
        
        db.run(sql, [fecha, tipo, pendiente, imputacion_ano, id], function(err) {
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
         WHERE ef.username = e.username AND ef.fecha = ? AND ef.pendiente = 1) as has_holiday,
        (SELECT tf.isHoras FROM empleado_festivos ef 
         JOIN TipoFestivo tf ON ef.tipo = tf.id
         WHERE ef.username = e.username AND ef.fecha = ? AND ef.pendiente = 1
         LIMIT 1) as is_hours
      FROM Empleados e
      WHERE e.fecha_fin IS NULL OR e.fecha_fin >= ?
    `;
    
    db.all(sql, [today, today, today], (err, rows) => {
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