const createHealthMonitor = ({
  listServers,
  check,
  incidentManager,
  notifier,
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

  const getStatus = () => ({
    started,
    running,
    lastRunAt,
    nextRunAt,
    lastError,
    servers: { ...servers }
  });

  const scheduleNext = () => {
    if (!started || timer !== null) return;
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

    const nextSnapshot = {};
    for (const result of results) {
      const outcome = await incidentManager.record(result, checkedAt);
      let latestIncident = outcome.incident;

      if (outcome.notification) {
        const delivery = await notifier.send(outcome.notification);
        latestIncident = await incidentManager.markDelivery(
          outcome.incident.id,
          outcome.notification.type,
          checkedAt,
          delivery.delivered
        );
      }

      nextSnapshot[result.name] = {
        ...result,
        incident: latestIncident
      };
    }

    servers = nextSnapshot;
    lastRunAt = checkedAt;
    lastError = null;
    return getStatus();
  };

  const runNow = () => {
    if (activeRun) return activeRun;

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
        scheduleNext();
      });

    return activeRun;
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

  return { start, stop, runNow, getStatus };
};

module.exports = { createHealthMonitor };
