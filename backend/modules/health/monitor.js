const createHealthMonitor = ({
  listServers,
  check,
  incidentManager,
  notifier,
  statusHistory = {
    record: async () => {},
    prune: async () => {}
  },
  intervalMs = 60000,
  timeoutMs = 5000,
  now = () => new Date(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  logger = console
}) => {
  let started = false;
  let running = false;
  let timer = null;
  let activeRun = null;
  let lastRunAt = null;
  let nextRunAt = null;
  let lastError = null;
  let servers = {};
  let catalogMutationTail = Promise.resolve();
  let pendingCatalogMutations = 0;
  let rerunRequested = false;

  const getStatus = () => ({
    state: !started ? 'stopped' : lastError ? 'degraded' : 'active',
    started,
    running,
    lastRunAt,
    nextRunAt,
    lastError,
    servers: { ...servers }
  });

  const scheduleNext = () => {
    if (!started || timer !== null || pendingCatalogMutations > 0) return;
    nextRunAt = new Date(now().getTime() + intervalMs).toISOString();
    timer = setTimer(() => {
      timer = null;
      nextRunAt = null;
      runNow();
    }, intervalMs);
  };

  const normalizeUnexpectedCheckError = (server, error, checkedAt) => ({
    serverId: server.id,
    name: server.name,
    url: server.url,
    checkedAt,
    status: 'error',
    components: {},
    error: {
      kind: 'internal',
      message: error.message,
      components: []
    },
    info: { connection: error.message }
  });

  const executeRound = async () => {
    const checkedAt = now().toISOString();
    const configuredServers = await listServers();
    const results = await Promise.all(
      configuredServers.map(async (server) => {
        try {
          return await check(server, { timeoutMs, checkedAt });
        } catch (error) {
          return normalizeUnexpectedCheckError(server, error, checkedAt);
        }
      })
    );

    for (const result of results) {
      try {
        await statusHistory.record(
          result.serverId,
          result.status,
          checkedAt
        );
      } catch (error) {
        logger.error(
          `Health status history write failed: ${error.message}`
        );
      }
    }
    try {
      await statusHistory.prune(checkedAt);
    } catch (error) {
      logger.error(`Health status history prune failed: ${error.message}`);
    }

    const nextSnapshot = {};
    const deliveries = [];
    for (const result of results) {
      const outcome = await incidentManager.record(result, checkedAt);
      nextSnapshot[result.name] = {
        ...result,
        incident: outcome.incident
      };
      if (outcome.notification && outcome.incident) {
        deliveries.push({ result, outcome });
      }
    }

    await Promise.all(
      deliveries.map(async ({ result, outcome }) => {
        const delivery = await notifier.send(outcome.notification);
        const latestIncident = await incidentManager.markDelivery(
          outcome.incident.id,
          outcome.notification.type,
          checkedAt,
          delivery.delivered
        );
        nextSnapshot[result.name].incident = latestIncident;
      })
    );

    servers = nextSnapshot;
    lastRunAt = checkedAt;
    lastError = null;
    return getStatus();
  };

  const runNow = () => {
    if (activeRun) return activeRun;
    if (pendingCatalogMutations > 0) {
      rerunRequested = true;
      return catalogMutationTail.then(() => activeRun || getStatus());
    }

    if (timer !== null) {
      clearTimer(timer);
      timer = null;
      nextRunAt = null;
    }

    running = true;
    activeRun = executeRound()
      .catch((error) => {
        lastError = error.message;
        logger.error(`Health monitor round failed: ${error.message}`);
        return getStatus();
      })
      .finally(() => {
        running = false;
        activeRun = null;
        if (rerunRequested && pendingCatalogMutations === 0) {
          rerunRequested = false;
          runNow();
        } else {
          scheduleNext();
        }
      });

    return activeRun;
  };

  const mutateCatalog = (operation) => {
    if (typeof operation !== 'function') {
      return Promise.reject(new TypeError('Catalog mutation must be a function'));
    }

    pendingCatalogMutations += 1;
    const mutation = catalogMutationTail.then(async () => {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
        nextRunAt = null;
      }
      if (activeRun) await activeRun;

      try {
        return await operation();
      } finally {
        pendingCatalogMutations -= 1;
        rerunRequested = true;
        if (pendingCatalogMutations === 0 && rerunRequested && !activeRun) {
          rerunRequested = false;
          Promise.resolve().then(runNow);
        }
      }
    });
    catalogMutationTail = mutation.catch(() => {});
    return mutation;
  };

  const start = () => {
    if (started) {
      return activeRun || Promise.resolve(getStatus());
    }
    started = true;
    logger.info('Health monitor started.');
    return runNow();
  };

  const stop = () => {
    started = false;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    nextRunAt = null;
    logger.info('Health monitor stopped.');
  };

  return { start, stop, runNow, mutateCatalog, getStatus };
};

module.exports = { createHealthMonitor };
