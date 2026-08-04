const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMessages,
  messageSignature,
  createComponentIncidentManager
} = require('../modules/health/component-incident-manager');

const T0 = '2026-08-04T10:00:00.000Z';
const T1 = '2026-08-04T10:01:00.000Z';

const component = (status, ...messages) => ({
  name: 'Database',
  status,
  errors: messages
});

const result = (components) => ({
  serverId: 7,
  name: 'Magma Nodo 7',
  status: Object.values(components).some(({ status }) => status === 'error')
    ? 'error'
    : Object.values(components).some(({ status }) => status === 'warning')
      ? 'warning'
      : 'ok',
  components,
  error: null,
  warning: null
});

const networkFailure = (message) => ({
  serverId: 7,
  name: 'Magma Nodo 7',
  status: 'error',
  components: {},
  error: { kind: 'network', message },
  warning: null
});

const openIncident = (componentKey, signature = '["Bloqueo"]') => ({
  id: componentKey,
  component_key: componentKey,
  last_message_signature: signature
});

const fakeStore = () => {
  const store = {
    active: [],
    created: [],
    updates: [],
    touches: [],
    resolved: [],
    async listActive() { return this.active; },
    async createEpisode(observation, observedAt) {
      const row = { id: `new-${observation.componentKey}`, component_key: observation.componentKey, observedAt };
      this.created.push(observation);
      this.active.push({ ...row, last_message_signature: observation.signature });
      return row;
    },
    async appendUpdate(incident, observation, observedAt) {
      this.updates.push({ incident, observation, observedAt });
      incident.last_message_signature = observation.signature;
      return incident;
    },
    async touch(incident, observation, observedAt) {
      this.touches.push({ incident, observation, observedAt });
      return incident;
    },
    async resolve(incident, observedAt, reason) {
      this.resolved.push({ ...incident, observedAt, reason });
      this.active = this.active.filter(({ component_key }) => component_key !== incident.component_key);
      return incident;
    },
    async listForServer(serverId, filters) { return { serverId, filters }; },
    async closeForRemovedServer(serverId, observedAt) { return { serverId, observedAt }; }
  };
  return store;
};

test('normalizes messages as an order-independent unique set', () => {
  const left = normalizeMessages([
    { message: ' Bloqueo en BD ' },
    'Timeout',
    { message: 'Bloqueo en BD' },
    { severity: 'error' }
  ]);
  const right = normalizeMessages(['Timeout', 'Bloqueo en BD']);

  assert.deepEqual(left, ['Bloqueo en BD', 'Timeout']);
  assert.equal(messageSignature(left), messageSignature(right));
});

test('uses the centralized fallback when components omit error detail', () => {
  assert.deepEqual(
    normalizeMessages([{ severity: 'error' }, '   ']),
    ['El check no devolvió detalle del problema']
  );
});

test('tracks db and db2 independently and closes only explicit ok checks', async () => {
  const store = fakeStore();
  const manager = createComponentIncidentManager({ store });
  await manager.record(result({
    db: component('error', 'Bloqueo'),
    db2: component('warning', 'Latencia')
  }), T0);
  await manager.record(result({
    db: component('ok'),
    db2: component('warning', 'Latencia alta')
  }), T1);

  assert.deepEqual(store.created.map((entry) => entry.componentKey), ['db', 'db2']);
  assert.deepEqual(store.resolved.map((entry) => entry.component_key), ['db']);
  assert.equal(store.updates[0].incident.component_key, 'db2');
  assert.deepEqual(store.updates[0].observation.messages, ['Latencia alta']);
});

test('repeated messages touch the episode without adding an update', async () => {
  const store = fakeStore();
  const manager = createComponentIncidentManager({ store });
  await manager.record(result({ db: component('error', 'Bloqueo') }), T0);
  await manager.record(result({ db: component('error', ' Bloqueo ') }), T1);

  assert.equal(store.updates.length, 0);
  assert.equal(store.touches.length, 1);
});

test('transport failure does not resolve active component episodes', async () => {
  const store = fakeStore();
  store.active = [openIncident('db')];
  const manager = createComponentIncidentManager({ store });
  await manager.record(networkFailure('ECONNREFUSED'), T1);

  assert.equal(store.resolved.length, 0);
  assert.equal(store.created[0].componentKey, '__server__');
  assert.equal(store.created[0].componentName, 'Conexión');
});

test('an omitted component does not resolve its active episode', async () => {
  const store = fakeStore();
  store.active = [openIncident('db')];
  const manager = createComponentIncidentManager({ store });
  const changed = await manager.record(result({}), T1);

  assert.equal(store.resolved.length, 0);
  assert.deepEqual(changed, []);
});

test('warning-to-error with the same message touches updated severities', async () => {
  const store = fakeStore();
  const manager = createComponentIncidentManager({ store });
  await manager.record(result({ db: component('warning', 'Latencia') }), T0);
  await manager.record(result({ db: component('error', 'Latencia') }), T1);

  assert.equal(store.updates.length, 0);
  assert.equal(store.touches.length, 1);
  assert.equal(store.touches[0].observation.severity, 'error');
});
