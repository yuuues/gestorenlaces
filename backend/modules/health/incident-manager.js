const notification = (type, incident) => ({ type, incident });

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
        return {
          incident,
          notification: notification('opened', incident)
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
      return {
        incident,
        notification: opensNow ? notification('opened', incident) : null
      };
    }

    const incident = await store.updateFailure(active, result, now);
    if (!incident.alert_notified_at) {
      return {
        incident,
        notification: notification('opened', incident)
      };
    }

    const lastNotification =
      incident.last_reminder_at || incident.alert_notified_at;
    const reminderDue =
      Date.parse(now) - Date.parse(lastNotification) >= reminderMs;
    return {
      incident,
      notification: reminderDue
        ? notification('reminder', incident)
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
      return {
        incident,
        notification: notification(
          incident.alert_notified_at ? 'recovered' : 'resolved-summary',
          incident
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
        pendingRecovery
      )
    };
  };

  const record = async (result, now) => {
    const active = await store.getActive(result.serverId);
    return result.status === 'error'
      ? recordFailure(result, now, active)
      : recordSuccess(result, now, active);
  };

  const markDelivery = (id, type, now, delivered) =>
    store.recordDelivery(id, type, now, delivered);

  const closeForRemovedServer = (serverId, now) =>
    store.closeForRemovedServer(serverId, now);

  const listRecent = (limit) => store.listRecent(limit);

  return {
    record,
    markDelivery,
    closeForRemovedServer,
    listRecent
  };
};

module.exports = { createIncidentManager };
