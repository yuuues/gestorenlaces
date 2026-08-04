const VALID_STATUSES = new Set(['ok', 'warning', 'error']);

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

const observation = (value) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new TypeError(`Invalid observation timestamp: ${value}`);
  }
  return { timestamp, iso: new Date(timestamp).toISOString() };
};

const createStatusHistoryStore = (
  db,
  {
    intervalMs = 60000,
    retentionMs = 7 * 24 * 60 * 60 * 1000
  } = {}
) => {
  const ensureSchema = async () => {
    await run(
      db,
      `
        CREATE TABLE IF NOT EXISTS health_status_periods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'error')),
          started_at TEXT NOT NULL,
          last_observed_at TEXT NOT NULL,
          ended_at TEXT
        )
      `
    );
    await run(
      db,
      `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_health_status_active_server
        ON health_status_periods(server_id)
        WHERE ended_at IS NULL
      `
    );
    await run(
      db,
      `
        CREATE INDEX IF NOT EXISTS idx_health_status_server_window
        ON health_status_periods(server_id, started_at, ended_at)
      `
    );
  };

  const insertPeriod = async (serverId, status, observedAt) => {
    const inserted = await run(
      db,
      `
        INSERT INTO health_status_periods (
          server_id, status, started_at, last_observed_at
        ) VALUES (?, ?, ?, ?)
      `,
      [serverId, status, observedAt, observedAt]
    );
    return get(
      db,
      'SELECT * FROM health_status_periods WHERE id = ?',
      [inserted.lastID]
    );
  };

  const record = async (serverId, status, observedAt) => {
    if (!VALID_STATUSES.has(status)) {
      throw new TypeError(`Invalid health status: ${status}`);
    }
    if (!Number.isInteger(serverId) || serverId < 1) {
      throw new TypeError(`Invalid server id: ${serverId}`);
    }
    const currentObservation = observation(observedAt);
    const active = await get(
      db,
      `
        SELECT *
        FROM health_status_periods
        WHERE server_id = ? AND ended_at IS NULL
      `,
      [serverId]
    );

    if (!active) {
      return insertPeriod(serverId, status, currentObservation.iso);
    }

    const lastObserved = observation(active.last_observed_at);
    if (currentObservation.timestamp < lastObserved.timestamp) {
      throw new RangeError('Observation is older than the active status period');
    }

    const gap = currentObservation.timestamp - lastObserved.timestamp;
    if (gap > intervalMs * 2) {
      const coveredUntil = new Date(
        lastObserved.timestamp + intervalMs
      ).toISOString();
      await run(
        db,
        'UPDATE health_status_periods SET ended_at = ? WHERE id = ?',
        [coveredUntil, active.id]
      );
      return insertPeriod(serverId, status, currentObservation.iso);
    }

    if (active.status !== status) {
      await run(
        db,
        'UPDATE health_status_periods SET ended_at = ? WHERE id = ?',
        [currentObservation.iso, active.id]
      );
      return insertPeriod(serverId, status, currentObservation.iso);
    }

    await run(
      db,
      'UPDATE health_status_periods SET last_observed_at = ? WHERE id = ?',
      [currentObservation.iso, active.id]
    );
    return get(db, 'SELECT * FROM health_status_periods WHERE id = ?', [
      active.id
    ]);
  };

  const closeForRemovedServer = async (serverId, observedAt) => {
    const currentObservation = observation(observedAt);
    await run(
      db,
      `
        UPDATE health_status_periods
        SET ended_at = ?
        WHERE server_id = ? AND ended_at IS NULL
      `,
      [currentObservation.iso, serverId]
    );
  };

  const prune = async (now) => {
    const currentObservation = observation(now);
    const cutoff = new Date(
      currentObservation.timestamp - retentionMs
    ).toISOString();
    await run(
      db,
      `
        DELETE FROM health_status_periods
        WHERE ended_at IS NOT NULL AND ended_at < ?
      `,
      [cutoff]
    );
  };

  const listOverlapping = async (serverIds, from, to) => {
    if (!Array.isArray(serverIds) || serverIds.length === 0) return [];
    const uniqueServerIds = [
      ...new Set(serverIds.filter((id) => Number.isInteger(id) && id > 0))
    ];
    if (uniqueServerIds.length === 0) return [];
    const start = observation(from);
    const end = observation(to);
    if (start.timestamp >= end.timestamp) {
      throw new RangeError('Status history window must end after it starts');
    }
    const placeholders = uniqueServerIds.map(() => '?').join(', ');
    return all(
      db,
      `
        SELECT *
        FROM health_status_periods
        WHERE server_id IN (${placeholders})
          AND started_at < ?
          AND (ended_at IS NULL OR ended_at > ?)
        ORDER BY server_id, started_at, id
      `,
      [...uniqueServerIds, end.iso, start.iso]
    );
  };

  return {
    ensureSchema,
    record,
    closeForRemovedServer,
    prune,
    listOverlapping
  };
};

module.exports = { createStatusHistoryStore };
