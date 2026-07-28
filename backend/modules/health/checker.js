const axios = require('axios');

const emptyError = (kind, message, extra = {}) => ({
  kind,
  message,
  components: [],
  ...extra
});

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const evaluateResponse = (response) => {
  const data = response.data;

  if (response.status !== 200) {
    return {
      status: 'error',
      components: isObject(data?.components) ? data.components : {},
      error: emptyError('http', `HTTP ${response.status}`, {
        httpStatus: response.status
      })
    };
  }

  if (!isObject(data)) {
    return {
      status: 'error',
      components: {},
      error: emptyError(
        'invalid_response',
        'Health response must be an object'
      )
    };
  }

  if (data.status === undefined && data.components === undefined) {
    return {
      status: 'error',
      components: {},
      error: emptyError(
        'invalid_response',
        'Health response must include status or components'
      )
    };
  }

  if (data.components !== undefined && !isObject(data.components)) {
    return {
      status: 'error',
      components: {},
      error: emptyError(
        'invalid_response',
        'Health response components must be an object'
      )
    };
  }

  const components = data.components || {};
  const failedComponents = Object.entries(components)
    .filter(([, component]) => !component || component.status !== 'ok')
    .map(([key, component]) => component?.name || key);

  if (data.status !== undefined && data.status !== 'ok') {
    return {
      status: 'error',
      components,
      error: {
        kind: 'service',
        message: data.message || `Service status: ${String(data.status)}`,
        components: failedComponents
      }
    };
  }

  if (failedComponents.length > 0) {
    return {
      status: 'error',
      components,
      error: {
        kind: 'component',
        message: `Components failed: ${failedComponents.join(', ')}`,
        components: failedComponents
      }
    };
  }

  return { status: 'ok', components, error: null };
};

const checkServer = async (server, options = {}) => {
  const httpClient = options.httpClient || axios;
  const timeoutMs = options.timeoutMs || 5000;
  const checkedAt = options.checkedAt || new Date().toISOString();

  try {
    const response = await httpClient.get(server.url, {
      timeout: timeoutMs,
      validateStatus: () => true
    });
    const evaluated = evaluateResponse(response);

    return {
      serverId: server.id,
      name: server.name,
      url: server.url,
      checkedAt,
      ...evaluated,
      info: {
        connection:
          evaluated.status === 'ok'
            ? 'Conexión validada'
            : evaluated.error.message
      }
    };
  } catch (error) {
    const kind =
      error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
        ? 'timeout'
        : 'network';

    return {
      serverId: server.id,
      name: server.name,
      url: server.url,
      checkedAt,
      status: 'error',
      components: {},
      error: emptyError(kind, error.message),
      info: { connection: error.message }
    };
  }
};

module.exports = { evaluateResponse, checkServer };
