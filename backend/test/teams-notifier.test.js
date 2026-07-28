const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAdaptiveCard,
  createTeamsNotifier
} = require('../modules/health/teams-notifier');

const baseIncident = {
  id: 12,
  server_id: 1,
  server_name: 'Magma Nodo 1',
  status: 'open',
  first_failed_at: '2026-07-28T10:00:00.000Z',
  last_failed_at: '2026-07-28T10:02:00.000Z',
  opened_at: '2026-07-28T10:01:00.000Z',
  resolved_at: null,
  consecutive_failures: 3,
  last_error: {
    kind: 'component',
    message: 'Components failed: Database',
    components: ['Database']
  }
};

const server = {
  id: 1,
  name: 'Magma Nodo 1',
  url: 'https://magma.example/health'
};

const openedNotification = {
  type: 'opened',
  incident: baseIncident,
  server
};

test('opened incident renders a red Adaptive Card with diagnostic facts', () => {
  const payload = buildAdaptiveCard(openedNotification);
  const card = payload.attachments[0].content;
  const serialized = JSON.stringify(card);

  assert.equal(payload.type, 'message');
  assert.equal(
    payload.attachments[0].contentType,
    'application/vnd.microsoft.card.adaptive'
  );
  assert.equal(card.type, 'AdaptiveCard');
  assert.match(serialized, /Incidencia detectada/);
  assert.match(serialized, /Attention/);
  assert.match(serialized, /Magma Nodo 1/);
  assert.match(serialized, /https:\/\/magma\.example\/health/);
  assert.match(serialized, /Database/);
});

test('reminder renders an orange card with accumulated duration', () => {
  const payload = buildAdaptiveCard({
    type: 'reminder',
    incident: baseIncident,
    server
  });
  const serialized = JSON.stringify(payload);

  assert.match(serialized, /El servicio sigue fallando/);
  assert.match(serialized, /Warning/);
  assert.match(serialized, /2 min/);
  assert.match(serialized, /3/);
});

test('recovery renders a green card with total duration', () => {
  const payload = buildAdaptiveCard({
    type: 'recovered',
    incident: {
      ...baseIncident,
      status: 'resolved',
      resolved_at: '2026-07-28T10:05:00.000Z'
    },
    server
  });
  const serialized = JSON.stringify(payload);

  assert.match(serialized, /Servicio recuperado/);
  assert.match(serialized, /Good/);
  assert.match(serialized, /5 min/);
});

test('resolved summary explains that the incident occurred and recovered', () => {
  const payload = buildAdaptiveCard({
    type: 'resolved-summary',
    incident: {
      ...baseIncident,
      status: 'resolved',
      resolved_at: '2026-07-28T10:03:00.000Z'
    },
    server
  });

  assert.match(
    JSON.stringify(payload),
    /La incidencia ocurrió y ya está resuelta/
  );
});

test('missing webhook returns undelivered without making an HTTP request', async () => {
  let called = false;
  const notifier = createTeamsNotifier({
    webhookUrl: '',
    httpClient: {
      post: async () => {
        called = true;
      }
    },
    logger: { warn() {}, error() {} }
  });

  const result = await notifier.send(openedNotification);

  assert.equal(notifier.configured, false);
  assert.equal(result.delivered, false);
  assert.equal(result.error, 'not_configured');
  assert.equal(called, false);
});

test('send posts the card with a timeout and JSON content type', async () => {
  let request;
  const notifier = createTeamsNotifier({
    webhookUrl: 'https://secret.example/hook',
    httpClient: {
      post: async (...args) => {
        request = args;
        return { status: 202 };
      }
    },
    timeoutMs: 5000,
    logger: { warn() {}, error() {} }
  });

  const result = await notifier.send(openedNotification);

  assert.equal(result.delivered, true);
  assert.equal(request[0], 'https://secret.example/hook');
  assert.equal(request[1].type, 'message');
  assert.equal(request[2].timeout, 5000);
  assert.equal(request[2].headers['Content-Type'], 'application/json');
});

test('HTTP errors are normalized without logging the webhook URL', async () => {
  const messages = [];
  const notifier = createTeamsNotifier({
    webhookUrl: 'https://secret.example/hook',
    httpClient: {
      post: async () => {
        throw new Error(
          'Request failed for https://secret.example/hook with status 503'
        );
      }
    },
    logger: {
      warn: (message) => messages.push(message),
      error: (message) => messages.push(message)
    }
  });

  const result = await notifier.send(openedNotification);

  assert.equal(result.delivered, false);
  assert.match(result.error, /503/);
  assert.equal(
    messages.join(' ').includes('https://secret.example/hook'),
    false
  );
});
