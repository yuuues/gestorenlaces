const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../../auth');
const schema = require('../../schema');
const { checkServer } = require('./checker');
const { readHealthConfig } = require('./config');
const { createIncidentStore } = require('./incident-store');
const { createIncidentManager } = require('./incident-manager');
const { createStatusHistoryStore } = require('./status-history-store');
const { createStatusHistoryService } = require('./status-history');
const { createTeamsNotifier } = require('./teams-notifier');
const { createHealthMonitor } = require('./monitor');

const dbRun = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const dbGet = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });

const dbAll = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });

const seedServersIfEmpty = async (db, logger) => {
  const row = await dbGet(db, 'SELECT COUNT(*) AS count FROM servers');
  if (row.count !== 0) {
    logger.info('Servers table already has data.');
    return;
  }

  const jsonPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'json',
    'servers.json'
  );
  if (!fs.existsSync(jsonPath)) {
    logger.info('Servers JSON file not found.');
    return;
  }

  const servers = JSON.parse(await fs.promises.readFile(jsonPath, 'utf8'));
  for (const server of servers) {
    await dbRun(
      db,
      'INSERT INTO servers (name, url, description) VALUES (?, ?, ?)',
      [server.name, server.url, server.description || '']
    );
  }
  logger.info('Servers loaded from JSON file.');
};

const prepareServers = async (db, logger) => {
  await dbRun(
    db,
    `
      CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        description TEXT
      )
    `
  );
  await schema.ensureColumns(db, 'servers', [
    { name: 'description', definition: 'TEXT' }
  ]);
  await seedServersIfEmpty(db, logger);
};

const safeIncidentLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 20;
  return Math.min(100, Math.max(1, parsed));
};

const clampInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const serverHistoryFilters = (query, now) => {
  const days = clampInteger(query.days, 0, 0, 3650);
  return {
    limit: clampInteger(query.limit, 20, 1, 50),
    offset: clampInteger(
      query.offset,
      0,
      0,
      Number.MAX_SAFE_INTEGER
    ),
    status: ['open', 'resolved'].includes(query.status)
      ? query.status
      : null,
    component:
      typeof query.component === 'string'
        ? query.component.trim().slice(0, 100)
        : '',
    from:
      days > 0
        ? new Date(now.getTime() - days * 86400000).toISOString()
        : null
  };
};

const statusHistoryOptions = (query, now) => {
  const hours = clampInteger(query.hours, 24, 1, 168);
  const requestedBucketMinutes = Number.parseInt(query.bucketMinutes, 10);
  const bucketMinutes = [5, 15, 30, 60].includes(requestedBucketMinutes)
    ? requestedBucketMinutes
    : 15;
  return {
    from: new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
    bucketMinutes
  };
};

const registerRoutes = (
  app,
  db,
  {
    monitor,
    incidentManager,
    statusHistoryStore,
    statusHistoryService,
    now,
    logger
  }
) => {
  app.get('/api/health/servers', async (_req, res) => {
    try {
      res.json(await dbAll(db, 'SELECT * FROM servers ORDER BY id'));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  const sendStatus = (_req, res) => res.json(monitor.getStatus());
  app.get('/api/health/status', sendStatus);
  app.get('/api/health/check', sendStatus);

  app.get('/api/health/status-history', async (req, res) => {
    try {
      const servers = await dbAll(db, 'SELECT id FROM servers ORDER BY id');
      return res.json(
        await statusHistoryService.getHistory(
          servers.map(({ id }) => id),
          statusHistoryOptions(req.query, now())
        )
      );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/health/incidents', async (req, res) => {
    try {
      const incidents = await incidentManager.listRecent(
        safeIncidentLimit(req.query.limit)
      );
      res.json(incidents);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/health/servers/:id/incidents', async (req, res) => {
    try {
      const serverId = Number.parseInt(req.params.id, 10);
      const server = Number.isInteger(serverId)
        ? await dbGet(db, 'SELECT id FROM servers WHERE id = ?', [
            serverId
          ])
        : null;
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      return res.json(
        await incidentManager.listForServer(
          serverId,
          serverHistoryFilters(req.query, now())
        )
      );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/health/check', requireAuth, async (_req, res) => {
    try {
      res.json(await monitor.runNow());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/health/servers', requireAuth, async (req, res) => {
    const { name, url, description } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    try {
      const server = await monitor.mutateCatalog(async () => {
        const inserted = await dbRun(
          db,
          'INSERT INTO servers (name, url, description) VALUES (?, ?, ?)',
          [name, url, description || '']
        );
        return dbGet(db, 'SELECT * FROM servers WHERE id = ?', [
          inserted.lastID
        ]);
      });
      return res.status(201).json(server);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/health/servers/:id', requireAuth, async (req, res) => {
    try {
      const updates = {};
      for (const field of ['name', 'url', 'description']) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }
      const fields = Object.keys(updates);
      if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const server = await monitor.mutateCatalog(async () => {
        const current = await dbGet(
          db,
          'SELECT * FROM servers WHERE id = ?',
          [req.params.id]
        );
        if (!current) return null;

        await dbRun(
          db,
          `UPDATE servers SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
          [...fields.map((field) => updates[field]), req.params.id]
        );
        return dbGet(db, 'SELECT * FROM servers WHERE id = ?', [
          req.params.id
        ]);
      });
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
      return res.json(server);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/health/servers/:id', requireAuth, async (req, res) => {
    try {
      const server = await monitor.mutateCatalog(async () => {
        const current = await dbGet(
          db,
          'SELECT * FROM servers WHERE id = ?',
          [req.params.id]
        );
        if (!current) return null;

        const removedAt = now().toISOString();
        await incidentManager.closeForRemovedServer(
          current.id,
          removedAt
        );
        await statusHistoryStore.closeForRemovedServer(
          current.id,
          removedAt
        );
        await dbRun(db, 'DELETE FROM servers WHERE id = ?', [current.id]);
        return current;
      });
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
      return res.json({ message: 'Server deleted successfully' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

const createHealthModule = (app, db, overrides = {}) => {
  const logger = overrides.logger || console;
  const now = overrides.now || (() => new Date());
  const config =
    overrides.config || readHealthConfig(overrides.env || process.env, logger);
  const incidentStore =
    overrides.incidentStore || createIncidentStore(db);
  const incidentManager =
    overrides.incidentManager ||
    createIncidentManager({
      store: incidentStore,
      failureThreshold: config.failureThreshold,
      reminderMs: config.reminderMs
    });
  const statusHistoryStore =
    overrides.statusHistoryStore ||
    createStatusHistoryStore(db, {
      intervalMs: config.intervalMs,
      retentionMs: 7 * 24 * 60 * 60 * 1000
    });
  const statusHistoryService =
    overrides.statusHistoryService ||
    createStatusHistoryService({
      store: statusHistoryStore,
      coverageMs: config.intervalMs
    });
  const notifier =
    overrides.notifier ||
    createTeamsNotifier({
      webhookUrl: config.teamsWebhookUrl,
      httpClient: overrides.teamsHttpClient,
      timeoutMs: config.timeoutMs,
      logger
    });
  const listServers =
    overrides.listServers ||
    (() => dbAll(db, 'SELECT * FROM servers ORDER BY id'));
  const check =
    overrides.check ||
    ((server, options) =>
      checkServer(server, {
        ...options,
        httpClient: overrides.healthHttpClient
      }));
  const monitor =
    overrides.monitor ||
    createHealthMonitor({
      listServers,
      check,
      incidentManager,
      notifier,
      statusHistory: statusHistoryStore,
      intervalMs: config.intervalMs,
      timeoutMs: config.timeoutMs,
      now,
      logger
    });

  registerRoutes(app, db, {
    monitor,
    incidentManager,
    statusHistoryStore,
    statusHistoryService,
    now,
    logger
  });

  const ready = (async () => {
    await prepareServers(db, logger);
    await incidentStore.ensureSchema();
    await statusHistoryStore.ensureSchema();
    await monitor.start();
  })();

  return {
    monitor,
    ready,
    incidentStore,
    incidentManager,
    statusHistoryStore,
    statusHistoryService,
    notifier,
    config
  };
};

exports.initialize = (app, db) => {
  console.log('Initializing health module...');
  const healthModule = createHealthModule(app, db);
  healthModule.ready
    .then(() => console.log('Health module initialized successfully.'))
    .catch((error) => {
      console.error(`Health module initialization failed: ${error.message}`);
    });
  return healthModule;
};

exports.createHealthModule = createHealthModule;
exports.routes = [
  { path: '/api/health/servers', methods: ['GET', 'POST'] },
  { path: '/api/health/servers/:id', methods: ['PUT', 'DELETE'] },
  { path: '/api/health/status', methods: ['GET'] },
  { path: '/api/health/status-history', methods: ['GET'] },
  { path: '/api/health/incidents', methods: ['GET'] },
  { path: '/api/health/servers/:id/incidents', methods: ['GET'] },
  { path: '/api/health/check', methods: ['GET', 'POST'] }
];
