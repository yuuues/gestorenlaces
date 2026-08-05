const exec = (db, sql) =>
  new Promise((resolve, reject) => {
    db.exec(sql, (error) => (error ? reject(error) : resolve()));
  });

const run = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const get = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });

const all = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });

const decodeEvent = (row) => ({
  id: row.id,
  type: row.type,
  severity: row.severity,
  observed_at: row.observed_at,
  messages: JSON.parse(row.messages)
});

const isLegacyUniqueConstraint = (error) =>
  error?.code === 'SQLITE_CONSTRAINT' &&
  /health_component_incidents\.legacy_incident_id, health_component_incidents\.component_key/.test(
    error.message
  );

const createComponentIncidentStore = (db) => {
  let operationTail = Promise.resolve();

  const enqueue = (operation) => {
    const result = operationTail.then(operation);
    operationTail = result.catch(() => {});
    return result;
  };

  const transaction = (operation) =>
    enqueue(async () => {
      await exec(db, 'BEGIN IMMEDIATE');
      try {
        const result = await operation();
        await exec(db, 'COMMIT');
        return result;
      } catch (error) {
        try {
          await exec(db, 'ROLLBACK');
        } catch {
          // Preserve the operation error that caused the rollback.
        }
        throw error;
      }
    });

  const getById = (id) =>
    get(db, 'SELECT * FROM health_component_incidents WHERE id = ?', [id]);

  const hydrateOne = async (id) => {
    const incident = await getById(id);
    if (!incident) return null;
    const events = await all(
      db,
      `
        SELECT id, type, severity, observed_at, messages
        FROM health_component_incident_events
        WHERE incident_id = ?
        ORDER BY observed_at, id
      `,
      [id]
    );
    return { ...incident, events: events.map(decodeEvent) };
  };

  const hydrateRows = async (incidents) => {
    if (incidents.length === 0) return [];
    const placeholders = incidents.map(() => '?').join(', ');
    const events = await all(
      db,
      `
        SELECT incident_id, id, type, severity, observed_at, messages
        FROM health_component_incident_events
        WHERE incident_id IN (${placeholders})
        ORDER BY incident_id, observed_at, id
      `,
      incidents.map(({ id }) => id)
    );
    const byIncident = new Map();
    for (const event of events) {
      const decoded = decodeEvent(event);
      const incidentEvents = byIncident.get(event.incident_id) || [];
      incidentEvents.push(decoded);
      byIncident.set(event.incident_id, incidentEvents);
    }
    return incidents.map((incident) => ({
      ...incident,
      events: byIncident.get(incident.id) || []
    }));
  };

  const updateObservation = async (incident, observation, observedAt) =>
    run(
      db,
      `
        UPDATE health_component_incidents
        SET current_severity = ?,
            highest_severity = CASE
              WHEN highest_severity = 'error' OR ? = 'error' THEN 'error'
              ELSE 'warning'
            END,
            last_observed_at = ?,
            observation_count = observation_count + 1,
            last_message_signature = ?
        WHERE id = ? AND status = 'open'
      `,
      [
        observation.severity,
        observation.severity,
        observedAt,
        observation.signature,
        incident.id
      ]
    );

  const migrateLegacyIncidents = async () => {
    const legacyTable = await get(
      db,
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'health_incidents'
      `
    );
    if (!legacyTable) return;

    const legacyIncidents = await all(
      db,
      `
        SELECT *
        FROM health_incidents
        WHERE status != 'pending'
        ORDER BY id
      `
    );
    if (legacyIncidents.length === 0) return;

    await exec(db, 'BEGIN IMMEDIATE');
    try {
      for (const legacy of legacyIncidents) {
        const legacyError = JSON.parse(legacy.last_error);
        const components = Array.isArray(legacyError.components) &&
          legacyError.components.length > 0
          ? legacyError.components
          : ['__server__'];
        const messages = [legacyError.message];

        for (const componentKey of components) {
          const migrated = await get(
            db,
            `
              SELECT id
              FROM health_component_incidents
              WHERE legacy_incident_id = ? AND component_key = ?
            `,
            [legacy.id, componentKey]
          );
          if (migrated) continue;

          let inserted;
          try {
            inserted = await run(
              db,
              `
                INSERT INTO health_component_incidents (
                  server_id,
                  server_name,
                  component_key,
                  component_name,
                  status,
                  current_severity,
                  highest_severity,
                  first_observed_at,
                  last_observed_at,
                  resolved_at,
                  resolution_reason,
                  observation_count,
                  last_message_signature,
                  legacy_incident_id
                ) VALUES (?, ?, ?, ?, ?, ?, 'error', ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                legacy.server_id,
                legacy.server_name,
                componentKey,
                componentKey === '__server__' ? 'Conexión' : componentKey,
                legacy.status,
                legacy.status === 'resolved' ? 'ok' : 'error',
                legacy.first_failed_at,
                legacy.last_failed_at,
                legacy.resolved_at,
                legacy.resolution_reason,
                legacy.consecutive_failures,
                JSON.stringify(messages),
                legacy.id
              ]
            );
          } catch (error) {
            if (isLegacyUniqueConstraint(error)) continue;
            throw error;
          }

          await run(
            db,
            `
              INSERT INTO health_component_incident_events (
                incident_id, type, severity, observed_at, messages
              ) VALUES (?, 'detected', 'error', ?, ?)
            `,
            [
              inserted.lastID,
              legacy.first_failed_at,
              JSON.stringify(messages)
            ]
          );
          if (legacy.status === 'resolved') {
            await run(
              db,
              `
                INSERT INTO health_component_incident_events (
                  incident_id, type, severity, observed_at, messages
                ) VALUES (?, 'recovered', 'ok', ?, '[]')
              `,
              [inserted.lastID, legacy.resolved_at || legacy.last_failed_at]
            );
          }
        }
      }
      await exec(db, 'COMMIT');
    } catch (error) {
      try {
        await exec(db, 'ROLLBACK');
      } catch {
        // Preserve the migration error that caused the rollback.
      }
      throw error;
    }
  };

  const ensureSchema = () =>
    enqueue(async () => {
      await exec(
        db,
        `
          CREATE TABLE IF NOT EXISTS health_component_incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER NOT NULL,
            server_name TEXT NOT NULL,
            component_key TEXT NOT NULL,
            component_name TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
            current_severity TEXT NOT NULL CHECK (current_severity IN ('ok', 'warning', 'error')),
            highest_severity TEXT NOT NULL CHECK (highest_severity IN ('warning', 'error')),
            first_observed_at TEXT NOT NULL,
            last_observed_at TEXT NOT NULL,
            resolved_at TEXT,
            resolution_reason TEXT,
            observation_count INTEGER NOT NULL DEFAULT 1,
            last_message_signature TEXT NOT NULL,
            legacy_incident_id INTEGER
          );

          CREATE TABLE IF NOT EXISTS health_component_incident_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('detected', 'update', 'recovered')),
            severity TEXT NOT NULL CHECK (severity IN ('ok', 'warning', 'error')),
            observed_at TEXT NOT NULL,
            messages TEXT NOT NULL,
            FOREIGN KEY (incident_id)
              REFERENCES health_component_incidents(id) ON DELETE CASCADE
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_health_component_incidents_open
          ON health_component_incidents(server_id, component_key)
          WHERE status = 'open';

          CREATE UNIQUE INDEX IF NOT EXISTS idx_health_component_incidents_legacy
          ON health_component_incidents(legacy_incident_id, component_key)
          WHERE legacy_incident_id IS NOT NULL;

          CREATE INDEX IF NOT EXISTS idx_health_component_events_incident_time
          ON health_component_incident_events(incident_id, observed_at, id);
        `
      );
      await migrateLegacyIncidents();
    });

  const listActive = (serverId) =>
    enqueue(() =>
      all(
        db,
        `
          SELECT *
          FROM health_component_incidents
          WHERE server_id = ? AND status = 'open'
          ORDER BY id
        `,
        [serverId]
      )
    );

  const createEpisode = (observation, observedAt) =>
    transaction(async () => {
      const existing = await get(
        db,
        `
          SELECT id
          FROM health_component_incidents
          WHERE server_id = ? AND component_key = ? AND status = 'open'
        `,
        [observation.serverId, observation.componentKey]
      );
      if (existing) {
        throw new Error(
          `Open component incident already exists for server ${observation.serverId} and component ${observation.componentKey}`
        );
      }

      const inserted = await run(
        db,
        `
          INSERT INTO health_component_incidents (
            server_id,
            server_name,
            component_key,
            component_name,
            status,
            current_severity,
            highest_severity,
            first_observed_at,
            last_observed_at,
            observation_count,
            last_message_signature
          ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, 1, ?)
        `,
        [
          observation.serverId,
          observation.serverName,
          observation.componentKey,
          observation.componentName,
          observation.severity,
          observation.severity,
          observedAt,
          observedAt,
          observation.signature
        ]
      );
      await run(
        db,
        `
          INSERT INTO health_component_incident_events (
            incident_id, type, severity, observed_at, messages
          ) VALUES (?, 'detected', ?, ?, ?)
        `,
        [
          inserted.lastID,
          observation.severity,
          observedAt,
          JSON.stringify(observation.messages)
        ]
      );
      return hydrateOne(inserted.lastID);
    });

  const appendUpdate = (incident, observation, observedAt) =>
    transaction(async () => {
      const updated = await updateObservation(incident, observation, observedAt);
      if (updated.changes !== 1) return null;
      await run(
        db,
        `
          INSERT INTO health_component_incident_events (
            incident_id, type, severity, observed_at, messages
          ) VALUES (?, 'update', ?, ?, ?)
        `,
        [
          incident.id,
          observation.severity,
          observedAt,
          JSON.stringify(observation.messages)
        ]
      );
      return hydrateOne(incident.id);
    });

  const touch = (incident, observation, observedAt) =>
    enqueue(async () => {
      const updated = await updateObservation(incident, observation, observedAt);
      return updated.changes === 1 ? hydrateOne(incident.id) : null;
    });

  const resolve = (incident, observedAt, reason) =>
    transaction(async () => {
      const updated = await run(
        db,
        `
          UPDATE health_component_incidents
          SET status = 'resolved',
              current_severity = 'ok',
              resolved_at = ?,
              resolution_reason = ?
          WHERE id = ? AND status = 'open'
        `,
        [observedAt, reason, incident.id]
      );
      if (updated.changes !== 1) return null;
      await run(
        db,
        `
          INSERT INTO health_component_incident_events (
            incident_id, type, severity, observed_at, messages
          ) VALUES (?, 'recovered', 'ok', ?, '[]')
        `,
        [incident.id, observedAt]
      );
      return hydrateOne(incident.id);
    });

  const listForServer = (
    serverId,
    {
      limit = 20,
      offset = 0,
      status = null,
      component = '',
      from = null
    } = {}
  ) =>
    enqueue(async () => {
      const conditions = ['server_id = ?'];
      const params = [serverId];

      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }
      if (component) {
        conditions.push('component_key = ?');
        params.push(component);
      }
      if (from) {
        conditions.push('first_observed_at >= ?');
        params.push(from);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      const countRow = await get(
        db,
        `SELECT COUNT(*) AS count FROM health_component_incidents ${where}`,
        params
      );
      const incidents = await all(
        db,
        `
          SELECT *
          FROM health_component_incidents
          ${where}
          ORDER BY first_observed_at DESC, id DESC
          LIMIT ? OFFSET ?
        `,
        [...params, limit, offset]
      );

      return {
        items: await hydrateRows(incidents),
        total: countRow.count,
        limit,
        offset
      };
    });

  const closeForRemovedServer = (serverId, observedAt) =>
    transaction(() =>
      run(
        db,
        `
          UPDATE health_component_incidents
          SET status = 'resolved',
              resolved_at = ?,
              resolution_reason = 'monitor_removed'
          WHERE server_id = ? AND status = 'open'
        `,
        [observedAt, serverId]
      )
    );

  return {
    ensureSchema,
    listActive,
    createEpisode,
    appendUpdate,
    touch,
    resolve,
    listForServer,
    closeForRemovedServer
  };
};

module.exports = { createComponentIncidentStore };
