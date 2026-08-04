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

const isUnstructuredServerFailure = (result) =>
  result.status === 'error' && !hasAffectedComponent(result);

const extractObservations = (result) => {
  const observations = Object.entries(result.components || {})
    .filter(([, component]) => isAffected(component))
    .map(([componentKey, component]) =>
      observationFor(result, componentKey, component, component.errors)
    );

  if (isUnstructuredServerFailure(result)) {
    observations.push(
      observationFor(
        result,
        '__server__',
        { name: 'Conexión', status: 'error' },
        [result.error?.message]
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
    const observations = extractObservations(result);
    const observationByKey = new Map(
      observations.map((item) => [item.componentKey, item])
    );
    const changed = [];

    for (const [key, component] of Object.entries(result.components || {})) {
      if (component?.status === 'ok' && activeByKey.has(key)) {
        changed.push(
          await store.resolve(activeByKey.get(key), observedAt, 'recovered')
        );
      }
    }

    if (!isUnstructuredServerFailure(result) && activeByKey.has('__server__')) {
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
