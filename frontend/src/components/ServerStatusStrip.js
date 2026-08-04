import React from 'react';
import './ServerStatusStrip.css';

const STATUS_LABEL = {
  ok: 'Operativo',
  warning: 'Parcialmente degradado',
  error: 'Servicio degradado',
  unknown: 'Sin datos'
};

const emptyBuckets = () =>
  Array.from({ length: 96 }, () => ({ start: null, status: 'unknown' }));

const intervalLabel = (bucket) => {
  const status = STATUS_LABEL[bucket.status] || STATUS_LABEL.unknown;
  if (!bucket.start) return `Intervalo de 15 minutos · ${status}`;
  const start = new Date(bucket.start);
  if (Number.isNaN(start.getTime())) {
    return `Intervalo de 15 minutos · ${status}`;
  }
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const format = (value) =>
    value.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  return `15 minutos, ${format(start)}–${format(end)} · ${status}`;
};

const ServerStatusStrip = ({ history, unavailable = false }) => {
  const buckets = unavailable || !history
    ? emptyBuckets()
    : history.buckets || emptyBuckets();
  const availability = unavailable
    ? null
    : history?.availabilityPercent;

  return (
    <section className="server-status-strip" aria-label="Estado de las últimas 24 horas">
      <div className="status-strip-heading">
        <strong>Últimas 24 horas</strong>
        <span>
          {unavailable
            ? 'Histórico no disponible'
            : availability === null || availability === undefined
              ? 'Disponibilidad no calculable'
              : `${availability} % operativo`}
        </span>
      </div>
      <div className="status-strip-blocks">
        {buckets.map((bucket, index) => {
          const status = STATUS_LABEL[bucket.status]
            ? bucket.status
            : 'unknown';
          const label = intervalLabel({ ...bucket, status });
          return (
            <span
              key={`${bucket.start || 'unknown'}-${index}`}
              className={`status-strip-block ${status}`}
              role="img"
              aria-label={label}
              title={label}
            />
          );
        })}
      </div>
      <div className="status-strip-axis" aria-hidden="true">
        <span>Hace 24 h</span>
        <span className="status-strip-axis-line" />
        <span>Ahora</span>
      </div>
    </section>
  );
};

export default ServerStatusStrip;
