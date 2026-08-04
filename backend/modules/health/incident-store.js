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

const decodeRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    last_error: JSON.parse(row.last_error)
  };
};

const createIncidentStore = (db) => {
  const getById = async (id) =>
    decodeRow(
      await get(db, 'SELECT * FROM health_incidents WHERE id = ?', [id])
    );

  const ensureSchema = () =>
    exec(
      db,
      `
        CREATE TABLE IF NOT EXISTS health_incidents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          server_name TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'open', 'resolved')),
          first_failed_at TEXT NOT NULL,
          last_failed_at TEXT NOT NULL,
          opened_at TEXT,
          resolved_at TEXT,
          resolution_reason TEXT,
          consecutive_failures INTEGER NOT NULL DEFAULT 1,
          last_error TEXT NOT NULL,
          alert_notified_at TEXT,
          last_reminder_at TEXT,
          recovery_notified_at TEXT,
          notification_attempts INTEGER NOT NULL DEFAULT 0
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_health_incidents_active_server
        ON health_incidents(server_id)
        WHERE status IN ('pending', 'open');
      `
    );

  const getActive = async (serverId) =>
    decodeRow(
      await get(
        db,
        `
          SELECT *
          FROM health_incidents
          WHERE server_id = ? AND status IN ('pending', 'open')
          ORDER BY id DESC
          LIMIT 1
        `,
        [serverId]
      )
    );

  const getPendingRecovery = async (serverId) =>
    decodeRow(
      await get(
        db,
        `
          SELECT *
          FROM health_incidents
          WHERE server_id = ?
            AND status = 'resolved'
            AND resolution_reason = 'recovered'
            AND recovery_notified_at IS NULL
          ORDER BY id DESC
          LIMIT 1
        `,
        [serverId]
      )
    );

  const insertPending = async (result, now) => {
    const inserted = await run(
      db,
      `
        INSERT INTO health_incidents (
          server_id,
          server_name,
          status,
          first_failed_at,
          last_failed_at,
          consecutive_failures,
          last_error
        )
        VALUES (?, ?, 'pending', ?, ?, 1, ?)
      `,
      [
        result.serverId,
        result.name,
        now,
        now,
        JSON.stringify(result.error)
      ]
    );
    return getById(inserted.lastID);
  };

  const updateFailure = async (
    incident,
    result,
    now,
    { status = incident.status, openedAt = incident.opened_at } = {}
  ) => {
    const updated = await run(
      db,
      `
        UPDATE health_incidents
        SET status = ?,
            opened_at = ?,
            last_failed_at = ?,
            consecutive_failures = ?,
            last_error = ?
        WHERE id = ? AND status = ?
      `,
      [
        status,
        openedAt,
        now,
        incident.consecutive_failures + 1,
        JSON.stringify(result.error),
        incident.id,
        incident.status
      ]
    );
    return updated.changes === 1 ? getById(incident.id) : null;
  };

  const openPending = async (incident, now) => {
    const updated = await run(
      db,
      `
        UPDATE health_incidents
        SET status = 'open', opened_at = ?
        WHERE id = ? AND status = 'pending'
      `,
      [now, incident.id]
    );
    return updated.changes === 1 ? getById(incident.id) : null;
  };

  const resolve = async (incident, now, reason) => {
    const updated = await run(
      db,
      `
        UPDATE health_incidents
        SET status = 'resolved',
            resolved_at = ?,
            resolution_reason = ?
        WHERE id = ? AND status = 'open'
      `,
      [now, reason, incident.id]
    );
    return updated.changes === 1 ? getById(incident.id) : null;
  };

  const resolveSilently = async (incident, now, reason) => {
    const updated = await run(
      db,
      `
        UPDATE health_incidents
        SET status = 'resolved',
            resolved_at = ?,
            resolution_reason = ?,
            recovery_notified_at = ?
        WHERE id = ? AND status = 'open'
      `,
      [now, reason, now, incident.id]
    );
    return updated.changes === 1 ? getById(incident.id) : null;
  };

  const deletePending = (id) =>
    run(
      db,
      "DELETE FROM health_incidents WHERE id = ? AND status = 'pending'",
      [id]
    );

  const recordDelivery = async (id, type, now, delivered) => {
    const timestampColumns = {
      opened: 'alert_notified_at',
      reminder: 'last_reminder_at',
      recovered: 'recovery_notified_at',
      'resolved-summary': 'recovery_notified_at'
    };
    const timestampColumn = timestampColumns[type];
    if (!timestampColumn) {
      throw new Error(`Unknown notification type: ${type}`);
    }

    if (delivered) {
      await run(
        db,
        `
          UPDATE health_incidents
          SET notification_attempts = notification_attempts + 1,
              ${timestampColumn} = ?
          WHERE id = ?
        `,
        [now, id]
      );
    } else {
      await run(
        db,
        `
          UPDATE health_incidents
          SET notification_attempts = notification_attempts + 1
          WHERE id = ?
        `,
        [id]
      );
    }
    return getById(id);
  };

  const closeForRemovedServer = async (serverId, now) => {
    await run(
      db,
      "DELETE FROM health_incidents WHERE server_id = ? AND status = 'pending'",
      [serverId]
    );
    await run(
      db,
      `
        UPDATE health_incidents
        SET status = 'resolved',
            resolved_at = ?,
            resolution_reason = 'monitor_removed',
            recovery_notified_at = ?
        WHERE server_id = ? AND status = 'open'
      `,
      [now, now, serverId]
    );
  };

  const listRecent = async (limit = 20) => {
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const rows = await all(
      db,
      `
        SELECT *
        FROM health_incidents
        WHERE status != 'pending'
        ORDER BY COALESCE(opened_at, first_failed_at) DESC, id DESC
        LIMIT ?
      `,
      [safeLimit]
    );
    return rows.map(decodeRow);
  };

  return {
    ensureSchema,
    getActive,
    getPendingRecovery,
    insertPending,
    updateFailure,
    openPending,
    resolve,
    resolveSilently,
    deletePending,
    recordDelivery,
    closeForRemovedServer,
    listRecent
  };
};

module.exports = { createIncidentStore };
