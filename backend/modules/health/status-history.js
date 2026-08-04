const STATUS_RANK = { unknown: 0, ok: 1, warning: 2, error: 3 };

const timestamp = (value, label) => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Invalid ${label}: ${value}`);
  }
  return parsed;
};

const buildServerStatusHistory = ({
  serverIds,
  periods,
  from,
  to,
  bucketMinutes,
  coverageMs
}) => {
  const fromMs = timestamp(from, 'history start');
  const toMs = timestamp(to, 'history end');
  const bucketMs = Number(bucketMinutes) * 60 * 1000;
  if (fromMs >= toMs) {
    throw new RangeError('Status history window must end after it starts');
  }
  if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
    throw new RangeError('Bucket minutes must be greater than zero');
  }
  if (!Number.isFinite(coverageMs) || coverageMs < 0) {
    throw new RangeError('Coverage must be zero or greater');
  }

  const bucketCount = Math.ceil((toMs - fromMs) / bucketMs);
  const uniqueServerIds = [...new Set(serverIds)];
  const periodsByServer = new Map(
    uniqueServerIds.map((serverId) => [serverId, []])
  );
  for (const period of periods || []) {
    if (
      periodsByServer.has(period.server_id) &&
      STATUS_RANK[period.status] !== undefined
    ) {
      periodsByServer.get(period.server_id).push(period);
    }
  }

  const servers = uniqueServerIds.map((serverId) => {
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
      start: new Date(fromMs + index * bucketMs).toISOString(),
      status: 'unknown'
    }));

    for (const period of periodsByServer.get(serverId) || []) {
      const periodStart = timestamp(period.started_at, 'period start');
      const periodEnd = period.ended_at
        ? timestamp(period.ended_at, 'period end')
        : Math.min(
            timestamp(period.last_observed_at, 'last observation') +
              coverageMs,
            toMs
          );
      if (periodEnd <= fromMs || periodStart >= toMs || periodEnd <= periodStart) {
        continue;
      }

      const firstBucket = Math.max(
        0,
        Math.floor((Math.max(periodStart, fromMs) - fromMs) / bucketMs)
      );
      const lastBucket = Math.min(
        bucketCount - 1,
        Math.ceil((Math.min(periodEnd, toMs) - fromMs) / bucketMs) - 1
      );
      for (let index = firstBucket; index <= lastBucket; index += 1) {
        if (STATUS_RANK[period.status] > STATUS_RANK[buckets[index].status]) {
          buckets[index].status = period.status;
        }
      }
    }

    const known = buckets.filter(({ status }) => status !== 'unknown');
    const green = known.filter(({ status }) => status === 'ok').length;
    return {
      serverId,
      availabilityPercent:
        known.length === 0
          ? null
          : Math.round((green / known.length) * 1000) / 10,
      buckets
    };
  });

  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    bucketMinutes: Number(bucketMinutes),
    servers
  };
};

const createStatusHistoryService = ({ store, coverageMs }) => ({
  getHistory: async (serverIds, { from, to, bucketMinutes }) => {
    const periods = await store.listOverlapping(serverIds, from, to);
    return buildServerStatusHistory({
      serverIds,
      periods,
      from,
      to,
      bucketMinutes,
      coverageMs
    });
  }
});

module.exports = {
  STATUS_RANK,
  buildServerStatusHistory,
  createStatusHistoryService
};
