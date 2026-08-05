const FALLBACK_MESSAGE = 'El check no devolvió detalle del problema';

const normalizeMessages = (errors = []) => {
  const values = errors
    .map((entry) => (typeof entry === 'string' ? entry : entry?.message))
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b));
  return unique.length > 0 ? unique : [FALLBACK_MESSAGE];
};

const messageSignature = (messages) => JSON.stringify([...messages].sort());

const isAffected = (component) =>
  component?.status === 'error' || component?.status === 'warning';

const observationFor = (result, componentKey, component, errors) => {
  const messages = normalizeMessages(errors);
  return {
    serverId: result.serverId,
    serverName: result.name,
    componentKey,
    componentName: component?.name || componentKey,
    severity: component?.status || 'error',
    messages,
    signature: messageSignature(messages)
  };
};

const hasAffectedComponent = (result) =>
  Object.values(result.components || {}).some(isAffected);

const isServerLevelIssue = (result) =>
  (result.status === 'error' || result.status === 'warning') &&
  !hasAffectedComponent(result);

const extractObservations = (result) => {
  const observations = Object.entries(result.components || {})
    .filter(([, component]) => isAffected(component))
    .map(([componentKey, component]) =>
      observationFor(result, componentKey, component, component.errors)
    );

  if (isServerLevelIssue(result)) {
    const diagnostic = result.status === 'error'
      ? result.error
      : result.warning;
    observations.push(
      observationFor(
        result,
        '__server__',
        { name: 'Conexión', status: result.status },
        [diagnostic]
      )
    );
  }

  return observations;
};

const createComponentIncidentManager = ({ store }) => {
  const record = async (result, observedAt) => {
    const active = await store.listActive(result.serverId);
    const activeByKey = new Map(
      active.map((row) => [row.component_key, row])
    );
    const liveComponents = Object.entries(result.components || {});
    const liveNameCounts = new Map();
    for (const [key, component] of liveComponents) {
      if (component?.status !== 'ok' && !isAffected(component)) continue;
      const name = component?.name || key;
      liveNameCounts.set(name, (liveNameCounts.get(name) || 0) + 1);
    }
    const observations = extractObservations(result);
    const observationByKey = new Map(
      observations.map((item) => [item.componentKey, item])
    );
    const changed = [];

    const activeFor = async (key, component) => {
      const exact = activeByKey.get(key);
      if (exact) return exact;

      const componentName = component?.name || key;
      if (liveNameCounts.get(componentName) !== 1) return null;
      const adopted = await store.adoptLegacyComponentKey(
        result.serverId,
        key,
        componentName
      );
      if (!adopted) return null;

      for (const [activeKey, incident] of activeByKey.entries()) {
        if (incident.id === adopted.id) activeByKey.delete(activeKey);
      }
      activeByKey.set(key, adopted);
      return adopted;
    };

    for (const [key, component] of liveComponents) {
      if (component?.status !== 'ok' && !isAffected(component)) continue;
      const incident = await activeFor(key, component);
      if (component?.status === 'ok' && incident) {
        changed.push(
          await store.resolve(incident, observedAt, 'recovered')
        );
      }
    }

    if (!isServerLevelIssue(result) && activeByKey.has('__server__')) {
      changed.push(
        await store.resolve(activeByKey.get('__server__'), observedAt, 'recovered')
      );
    }

    for (const observation of observationByKey.values()) {
      const incident = activeByKey.get(observation.componentKey);
      if (!incident) {
        changed.push(await store.createEpisode(observation, observedAt));
      } else if (incident.last_message_signature !== observation.signature) {
        changed.push(
          await store.appendUpdate(incident, observation, observedAt)
        );
      } else {
        changed.push(await store.touch(incident, observation, observedAt));
      }
    }
    return changed.filter(Boolean);
  };

  return {
    record,
    listForServer: (serverId, filters) => store.listForServer(serverId, filters),
    closeForRemovedServer: (serverId, observedAt) =>
      store.closeForRemovedServer(serverId, observedAt)
  };
};

module.exports = {
  FALLBACK_MESSAGE,
  normalizeMessages,
  messageSignature,
  createComponentIncidentManager
};
