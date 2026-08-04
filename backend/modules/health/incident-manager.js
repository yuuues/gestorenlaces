const notification = (type, incident, result) => ({
  type,
  incident,
  server: {
    id: result.serverId,
    name: result.name,
    url: result.url
  }
});

const createIncidentManager = ({
  store,
  failureThreshold = 2,
  reminderMs = 15 * 60 * 1000
}) => {
  const recordFailure = async (result, now, active) => {
    if (!active) {
      let incident = await store.insertPending(result, now);
      if (failureThreshold <= 1) {
        incident = await store.openPending(incident, now);
        if (!incident) return { incident: null, notification: null };
        return {
          incident,
          notification: notification('opened', incident, result)
        };
      }
      return { incident, notification: null };
    }

    if (active.status === 'pending') {
      const opensNow =
        active.consecutive_failures + 1 >= failureThreshold;
      const incident = await store.updateFailure(active, result, now, {
        status: opensNow ? 'open' : 'pending',
        openedAt: opensNow ? now : active.opened_at
      });
      if (!incident) return { incident: null, notification: null };
      return {
        incident,
        notification: opensNow
          ? notification('opened', incident, result)
          : null
      };
    }

    const incident = await store.updateFailure(active, result, now);
    if (!incident) return { incident: null, notification: null };
    if (!incident.alert_notified_at) {
      return {
        incident,
        notification: notification('opened', incident, result)
      };
    }

    const lastNotification =
      incident.last_reminder_at || incident.alert_notified_at;
    const reminderDue =
      Date.parse(now) - Date.parse(lastNotification) >= reminderMs;
    return {
      incident,
      notification: reminderDue
        ? notification('reminder', incident, result)
        : null
    };
  };

  const recordSuccess = async (result, now, active) => {
    if (active?.status === 'pending') {
      await store.deletePending(active.id);
      return { incident: null, notification: null };
    }

    if (active?.status === 'open') {
      const incident = await store.resolve(active, now, 'recovered');
      if (!incident) return { incident: null, notification: null };
      return {
        incident,
        notification: notification(
          incident.alert_notified_at ? 'recovered' : 'resolved-summary',
          incident,
          result
        )
      };
    }

    const pendingRecovery = await store.getPendingRecovery(result.serverId);
    if (!pendingRecovery) {
      return { incident: null, notification: null };
    }
    return {
      incident: pendingRecovery,
      notification: notification(
        pendingRecovery.alert_notified_at
          ? 'recovered'
          : 'resolved-summary',
        pendingRecovery,
        result
      )
    };
  };

  const recordWarning = async (now, active) => {
    if (active?.status === 'pending') {
      await store.deletePending(active.id);
      return { incident: null, notification: null };
    }

    if (active?.status === 'open') {
      const incident = await store.resolveSilently(
        active,
        now,
        'warning'
      );
      return { incident, notification: null };
    }

    return { incident: null, notification: null };
  };

  const record = async (result, now) => {
    const active = await store.getActive(result.serverId);
    if (result.status === 'error') {
      return recordFailure(result, now, active);
    }
    if (result.status === 'warning') {
      return recordWarning(now, active);
    }
    return recordSuccess(result, now, active);
  };

  const markDelivery = (id, type, now, delivered) =>
    store.recordDelivery(id, type, now, delivered);

  const closeForRemovedServer = (serverId, now) =>
    store.closeForRemovedServer(serverId, now);

  const listRecent = (limit) => store.listRecent(limit);

  const listForServer = (serverId, filters) =>
    store.listForServer(serverId, filters);

  return {
    record,
    markDelivery,
    closeForRemovedServer,
    listRecent,
    listForServer
  };
};

module.exports = { createIncidentManager };
