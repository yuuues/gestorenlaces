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
  const hasValidHealthShape =
    isObject(data) &&
    data.status !== undefined &&
    (data.components === undefined || isObject(data.components));
  const hasStructuredHealthError =
    hasValidHealthShape &&
    ((data.status !== 'ok' && data.status !== 'warning') ||
      Object.values(data.components || {}).some(
        (component) =>
          !component ||
          (component.status !== 'ok' && component.status !== 'warning')
      ));

  if (response.status !== 200 && !hasStructuredHealthError) {
    return {
      status: 'error',
      components: isObject(data?.components) ? data.components : {},
      error: emptyError('http', `HTTP ${response.status}`, {
        httpStatus: response.status
      }),
      warning: null
    };
  }

  if (!isObject(data)) {
    return {
      status: 'error',
      components: {},
      error: emptyError(
        'invalid_response',
        'Health response must be an object'
      ),
      warning: null
    };
  }

  if (data.status === undefined) {
    return {
      status: 'error',
      components: {},
      error: emptyError(
        'invalid_response',
        'Health response must include a top-level status'
      ),
      warning: null
    };
  }

  if (data.components !== undefined && !isObject(data.components)) {
    return {
      status: 'error',
      components: {},
      error: emptyError(
        'invalid_response',
        'Health response components must be an object'
      ),
      warning: null
    };
  }

  const components = data.components || {};
  const errorComponents = Object.entries(components)
    .filter(
      ([, component]) =>
        !component ||
        (component.status !== 'ok' && component.status !== 'warning')
    )
    .map(([key, component]) => component?.name || key);
  const warningComponents = Object.entries(components)
    .filter(([, component]) => component?.status === 'warning')
    .map(([key, component]) => component?.name || key);
  const topLevelError =
    data.status !== 'ok' && data.status !== 'warning';

  if (topLevelError || errorComponents.length > 0) {
    return {
      status: 'error',
      components,
      error: {
        kind: topLevelError ? 'service' : 'component',
        message:
          data.message ||
          (errorComponents.length > 0
            ? `Components failed: ${errorComponents.join(', ')}`
            : `Service status: ${String(data.status)}`),
        components: errorComponents,
        ...(response.status !== 200
          ? { httpStatus: response.status }
          : {})
      },
      warning: null
    };
  }

  if (data.status === 'warning' || warningComponents.length > 0) {
    return {
      status: 'warning',
      components,
      error: null,
      warning: {
        kind: data.status === 'warning' ? 'service' : 'component',
        message:
          data.message ||
          (warningComponents.length > 0
            ? `Components warning: ${warningComponents.join(', ')}`
            : `Service status: ${String(data.status)}`),
        components: warningComponents
      }
    };
  }

  return { status: 'ok', components, error: null, warning: null };
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
            : (evaluated.error || evaluated.warning).message
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
      warning: null,
      info: { connection: error.message }
    };
  }
};

module.exports = { evaluateResponse, checkServer };
