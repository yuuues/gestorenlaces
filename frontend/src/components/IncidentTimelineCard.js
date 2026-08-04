import React from 'react';
import './IncidentTimelineCard.css';

export const formatIncidentTimestamp = (value) => {
  if (!value) return 'Pendiente';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('es-ES');
};

export const formatIncidentDuration = (incident) => {
  if (!incident?.first_failed_at) return null;
  const start = Date.parse(incident.first_failed_at);
  const end = Date.parse(
    incident.resolved_at ||
      incident.last_failed_at ||
      incident.first_failed_at
  );
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  return minutes < 1 ? 'menos de un minuto' : `${minutes} min`;
};

const IncidentTimelineCard = ({ incident, serverName }) => {
  const components = Array.isArray(incident?.last_error?.components)
    ? incident.last_error.components
    : [];
  const context = components.length > 0
    ? components.join(', ')
    : serverName || incident?.server_name || 'servidor';
  const open = incident?.status === 'open';
  const endLabel = open
    ? 'En curso'
    : incident?.resolution_reason === 'warning'
      ? 'El error pasó a aviso'
      : 'Servicio recuperado';
  const duration = formatIncidentDuration(incident);

  return (
    <article className={`incident-timeline-card ${open ? 'open' : 'resolved'}`}>
      <header className="incident-timeline-header">
        <h3>Incidencia de {context}</h3>
        <span className={`incident-state ${open ? 'open' : 'resolved'}`}>
          {open ? 'Abierta' : 'Resuelta'}
        </span>
      </header>

      {incident?.last_error?.message && (
        <p className="incident-diagnostic">
          {incident.last_error.message}
        </p>
      )}

      <ol className="incident-timeline">
        <li className="detected">
          <strong>Error detectado</strong>
          <span>{formatIncidentTimestamp(incident?.first_failed_at)}</span>
        </li>
        <li className={open ? 'ongoing' : incident?.resolution_reason === 'warning' ? 'warning' : 'recovered'}>
          <strong>{endLabel}</strong>
          <span>
            {open
              ? formatIncidentTimestamp(incident?.last_failed_at)
              : formatIncidentTimestamp(incident?.resolved_at)}
          </span>
        </li>
      </ol>

      <footer className="incident-timeline-footer">
        <span>{incident?.consecutive_failures || 0} fallos consecutivos</span>
        {duration && <span>{duration}</span>}
      </footer>
    </article>
  );
};

export default IncidentTimelineCard;
