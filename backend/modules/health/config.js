const DEFAULTS = {
  intervalSeconds: 60,
  failureThreshold: 2,
  reminderMinutes: 15,
  timeoutMs: 5000
};

const positiveInteger = (env, key, fallback, logger) => {
  const raw = env[key];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isInteger(value) && value > 0 && String(value) === raw.trim()) {
    return value;
  }
  logger.warn(`${key} no es válido; se usará ${fallback}.`);
  return fallback;
};

const readHealthConfig = (env = process.env, logger = console) => ({
  intervalMs:
    positiveInteger(
      env,
      'HEALTH_CHECK_INTERVAL_SECONDS',
      DEFAULTS.intervalSeconds,
      logger
    ) * 1000,
  failureThreshold: positiveInteger(
    env,
    'HEALTH_FAILURE_THRESHOLD',
    DEFAULTS.failureThreshold,
    logger
  ),
  reminderMs:
    positiveInteger(
      env,
      'HEALTH_REMINDER_MINUTES',
      DEFAULTS.reminderMinutes,
      logger
    ) *
    60 *
    1000,
  timeoutMs: positiveInteger(
    env,
    'HEALTH_REQUEST_TIMEOUT_MS',
    DEFAULTS.timeoutMs,
    logger
  ),
  teamsWebhookUrl: env.TEAMS_HEALTH_WEBHOOK_URL || ''
});

module.exports = { readHealthConfig };
