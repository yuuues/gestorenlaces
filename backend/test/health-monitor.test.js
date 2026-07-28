const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHealthMonitor } = require('../modules/health/monitor');

const serverA = {
  id: 1,
  name: 'API',
  url: 'https://api.example/health'
};
const serverB = {
  id: 2,
  name: 'Database',
  url: 'https://db.example/health'
};
const okA = {
  serverId: 1,
  name: 'API',
  url: serverA.url,
  status: 'ok',
  checkedAt: '2026-07-28T10:00:00.000Z',
  components: {},
  error: null,
  info: { connection: 'Conexión validada' }
};
const errorB = {
  serverId: 2,
  name: 'Database',
  url: serverB.url,
  status: 'error',
  checkedAt: '2026-07-28T10:00:00.000Z',
  components: {},
  error: { kind: 'network', message: 'refused', components: [] },
  info: { connection: 'refused' }
};
const incident = {
  id: 9,
  server_id: 2,
  status: 'open',
  first_failed_at: '2026-07-28T10:00:00.000Z',
  last_failed_at: '2026-07-28T10:01:00.000Z',
  consecutive_failures: 2,
  last_error: errorB.error
};
const openedNotification = {
  type: 'opened',
  incident,
  server: serverB
};

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const silentLogger = { info() {}, warn() {}, error() {} };

const makeMonitor = (overrides = {}) =>
  createHealthMonitor({
    listServers: async () => [serverA],
    check: async () => okA,
    incidentManager: {
      record: async () => ({ incident: null, notification: null }),
      markDelivery: async () => {}
    },
    notifier: { send: async () => ({ delivered: true }) },
    intervalMs: 60000,
    timeoutMs: 5000,
    now: () => new Date('2026-07-28T10:00:00.000Z'),
    setTimer: () => 1,
    clearTimer: () => {},
    logger: silentLogger,
    ...overrides
  });

test('checks all servers concurrently and publishes one snapshot', async () => {
  const gates = [deferred(), deferred()];
  const started = new Set();
  const monitor = makeMonitor({
    listServers: async () => [serverA, serverB],
    check: (server) => {
      started.add(server.id);
      return server.id === 1 ? gates[0].promise : gates[1].promise;
    }
  });

  const running = monitor.runNow();
  await Promise.resolve();

  assert.deepEqual([...started].sort(), [1, 2]);
  gates[0].resolve(okA);
  gates[1].resolve(errorB);
  await running;

  const status = monitor.getStatus();
  assert.equal(status.running, false);
  assert.deepEqual(Object.keys(status.servers).sort(), ['API', 'Database']);
  assert.equal(status.servers.Database.status, 'error');
});

test('overlapping runNow calls share the exact active promise', async () => {
  const gate = deferred();
  let checks = 0;
  const monitor = makeMonitor({
    check: () => {
      checks += 1;
      return gate.promise;
    }
  });

  const first = monitor.runNow();
  const second = monitor.runNow();
  await Promise.resolve();

  assert.strictEqual(second, first);
  assert.equal(checks, 1);
  gate.resolve(okA);
  await first;
});

test('an empty server catalog publishes an empty snapshot', async () => {
  const monitor = makeMonitor({ listServers: async () => [] });

  await monitor.runNow();

  assert.deepEqual(monitor.getStatus().servers, {});
  assert.equal(monitor.getStatus().lastError, null);
});

test('successful Teams delivery records a delivered attempt', async () => {
  const calls = [];
  const monitor = makeMonitor({
    listServers: async () => [serverB],
    check: async () => errorB,
    incidentManager: {
      record: async () => ({
        incident,
        notification: openedNotification
      }),
      markDelivery: async (...args) => {
        calls.push(args);
        return { ...incident, alert_notified_at: args[2] };
      }
    },
    notifier: { send: async () => ({ delivered: true }) }
  });

  await monitor.runNow();

  assert.deepEqual(calls, [
    [9, 'opened', '2026-07-28T10:00:00.000Z', true]
  ]);
  assert.equal(
    monitor.getStatus().servers.Database.incident.alert_notified_at,
    '2026-07-28T10:00:00.000Z'
  );
});

test('failed Teams delivery records an undelivered attempt', async () => {
  const calls = [];
  const monitor = makeMonitor({
    listServers: async () => [serverB],
    check: async () => errorB,
    incidentManager: {
      record: async () => ({
        incident,
        notification: openedNotification
      }),
      markDelivery: async (...args) => {
        calls.push(args);
        return incident;
      }
    },
    notifier: {
      send: async () => ({ delivered: false, error: 'HTTP 503' })
    }
  });

  await monitor.runNow();

  assert.deepEqual(calls, [
    [9, 'opened', '2026-07-28T10:00:00.000Z', false]
  ]);
});

test('dispatches independent Teams notifications concurrently', async () => {
  const deliveryGates = [deferred(), deferred()];
  const sends = [];
  const monitor = makeMonitor({
    listServers: async () => [serverA, serverB],
    check: async (server) => (server.id === 1 ? okA : errorB),
    incidentManager: {
      record: async (result) => {
        const resultIncident = {
          ...incident,
          id: result.serverId,
          server_id: result.serverId
        };
        return {
          incident: resultIncident,
          notification: {
            type: 'opened',
            incident: resultIncident,
            server: {
              id: result.serverId,
              name: result.name,
              url: result.url
            }
          }
        };
      },
      markDelivery: async (id) => ({
        ...incident,
        id,
        server_id: id
      })
    },
    notifier: {
      send: (notification) => {
        sends.push(notification.server.id);
        return deliveryGates[sends.length - 1].promise;
      }
    }
  });

  const running = monitor.runNow();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(sends.sort(), [1, 2]);
  deliveryGates.forEach((gate) => gate.resolve({ delivered: true }));
  await running;
});

test('start runs immediately and schedules the next round after completion', async () => {
  const timers = [];
  const monitor = makeMonitor({
    setTimer: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    }
  });

  await monitor.start();

  assert.equal(monitor.getStatus().started, true);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 60000);
  assert.equal(
    monitor.getStatus().nextRunAt,
    '2026-07-28T10:01:00.000Z'
  );
});

test('stop clears the timer and marks the monitor inactive', async () => {
  const cleared = [];
  const monitor = makeMonitor({
    setTimer: () => 44,
    clearTimer: (timer) => cleared.push(timer)
  });
  await monitor.start();

  monitor.stop();

  assert.deepEqual(cleared, [44]);
  assert.equal(monitor.getStatus().started, false);
  assert.equal(monitor.getStatus().nextRunAt, null);
});

test('catalog failures are reported without rejecting the run', async () => {
  const messages = [];
  const monitor = makeMonitor({
    listServers: async () => {
      throw new Error('database unavailable');
    },
    logger: {
      info() {},
      warn() {},
      error: (message) => messages.push(message)
    }
  });

  await monitor.start();

  assert.equal(monitor.getStatus().running, false);
  assert.equal(monitor.getStatus().state, 'degraded');
  assert.equal(monitor.getStatus().lastError, 'database unavailable');
  assert.match(messages[0], /database unavailable/);
});

test('catalog mutations wait for an active round and trigger a fresh round', async () => {
  const firstCheck = deferred();
  let checks = 0;
  let mutated = false;
  const monitor = makeMonitor({
    check: async () => {
      checks += 1;
      if (checks === 1) return firstCheck.promise;
      return okA;
    }
  });

  const running = monitor.runNow();
  await Promise.resolve();
  const mutation = monitor.mutateCatalog(async () => {
    mutated = true;
  });
  await Promise.resolve();

  assert.equal(mutated, false);
  firstCheck.resolve(okA);
  await running;
  await mutation;
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(mutated, true);
  assert.equal(checks, 2);
});
