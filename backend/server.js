const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Check if frontend build exists, if not build it
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
const indexHtmlPath = path.join(frontendBuildPath, 'index.html');

if (!fs.existsSync(indexHtmlPath)) {
  console.log('Frontend build not found. Building frontend...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
    console.log('Frontend built successfully.');
  } catch (error) {
    console.error('Error building frontend:', error);
    process.exit(1);
  }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database setup
const dbPath = path.join(__dirname, 'bookmarks.db');
const db = new sqlite3.Database(dbPath);

// Create bookmarks table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      short_description TEXT NOT NULL,
      long_description TEXT,
      link TEXT NOT NULL,
      icon TEXT
    )
  `);
});

// Initialize database from JSON if it doesn't exist
const initDbFromJson = () => {
  // Check if database is empty
  db.get('SELECT COUNT(*) as count FROM bookmarks', (err, row) => {
    if (err) {
      console.error('Error checking database:', err);
      return;
    }

    // If database is empty, import from JSON
    if (row.count === 0) {
      const jsonPath = path.join(__dirname, '..', 'json', 'bookmarks.json');

      if (fs.existsSync(jsonPath)) {
        try {
          const bookmarksData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

          const stmt = db.prepare('INSERT INTO bookmarks (category, short_description, long_description, link, icon) VALUES (?, ?, ?, ?, ?)');

          bookmarksData.forEach(bookmark => {
            stmt.run(
              bookmark.category,
              bookmark.short_description,
              bookmark.long_description || '',
              bookmark.link,
              bookmark.icon || ''
            );
          });

          stmt.finalize();
          console.log('Database initialized with data from JSON file.');
        } catch (error) {
          console.error('Error importing from JSON:', error);
        }
      } else {
        console.log('JSON file not found. Created empty database.');
      }
    } else {
      console.log('Database already has data.');
    }
  });
};

// Initialize database
initDbFromJson();

// API Routes

// Get all bookmarks
app.get('/api/bookmarks', (req, res) => {
  db.all('SELECT * FROM bookmarks', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get bookmarks by category
app.get('/api/bookmarks/category/:category', (req, res) => {
  const { category } = req.params;

  db.all('SELECT * FROM bookmarks WHERE category = ?', [category], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get all categories
app.get('/api/categories', (req, res) => {
  db.all('SELECT DISTINCT category FROM bookmarks', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    const categories = rows.map(row => row.category);
    res.json(categories);
  });
});

// Create a new bookmark
app.post('/api/bookmarks', (req, res) => {
  const { category, short_description, long_description, link, icon } = req.body;

  if (!category || !short_description || !link) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sql = `
    INSERT INTO bookmarks (category, short_description, long_description, link, icon)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [category, short_description, long_description || '', link, icon || ''], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    db.get('SELECT * FROM bookmarks WHERE id = ?', [this.lastID], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json(row);
    });
  });
});

// Update a bookmark
app.put('/api/bookmarks/:id', (req, res) => {
  const { id } = req.params;
  const { category, short_description, long_description, link, icon } = req.body;

  // Check if bookmark exists
  db.get('SELECT * FROM bookmarks WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    // Update bookmark
    const updates = {};
    if (category !== undefined) updates.category = category;
    if (short_description !== undefined) updates.short_description = short_description;
    if (long_description !== undefined) updates.long_description = long_description;
    if (link !== undefined) updates.link = link;
    if (icon !== undefined) updates.icon = icon;

    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);

    if (values.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const sql = `UPDATE bookmarks SET ${fields} WHERE id = ?`;

    db.run(sql, [...values, id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.get('SELECT * FROM bookmarks WHERE id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    });
  });
});

// Delete a bookmark
app.delete('/api/bookmarks/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM bookmarks WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    res.json({ message: 'Bookmark deleted successfully' });
  });
});

// Export bookmarks to JSON
app.get('/api/export', (req, res) => {
  db.all('SELECT category, short_description, long_description, link, icon FROM bookmarks', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const jsonPath = path.join(__dirname, '..', 'json', 'bookmarks.json');

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
      res.json({ message: 'Bookmarks exported successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));

// The "catchall" handler: for any request that doesn't match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Close database connection when app is terminated
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
