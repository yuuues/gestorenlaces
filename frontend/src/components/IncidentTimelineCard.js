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
  const firstObservedAt = incident?.first_observed_at || incident?.first_failed_at;
  if (!firstObservedAt) return null;
  const start = Date.parse(firstObservedAt);
  const end = Date.parse(
    incident.resolved_at ||
      incident.last_observed_at ||
      incident.last_failed_at ||
      firstObservedAt
  );
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  return minutes < 1 ? 'menos de un minuto' : `${minutes} min`;
};

const eventLabel = (event) => {
  if (event.type === 'recovered') return 'Servicio recuperado';
  if (event.type === 'warning') return 'Pasó a aviso';
  if (event.type === 'monitor_removed') return 'Monitor eliminado';
  if (event.type === 'update') {
    return `Actualización · ${event.severity === 'warning' ? 'Aviso' : 'Error'}`;
  }
  return event.severity === 'warning' ? 'Aviso detectado' : 'Error detectado';
};

const IncidentTimelineCard = ({ incident, serverName }) => {
  const hasEvents = Array.isArray(incident?.events);
  const severity = incident?.highest_severity || incident?.current_severity || 'error';
  const currentSeverity = incident?.current_severity || severity;
  const components = Array.isArray(incident?.last_error?.components)
    ? incident.last_error.components
    : [];
  const legacyContext = components.length > 0
    ? components.join(', ')
    : serverName || incident?.server_name || 'servidor';
  const context = incident?.component_name || incident?.component_key || legacyContext;
  const title = `${severity === 'warning' ? 'Aviso' : 'Incidencia'} de ${context}`;
  const count = incident?.observation_count ?? incident?.consecutive_failures ?? 0;
  const open = incident?.status === 'open';
  const stateLabel = open
    ? currentSeverity === 'warning' ? 'Aviso activo' : 'Error activo'
    : 'Resuelta';
  const endLabel = open
    ? 'En curso'
    : incident?.resolution_reason === 'warning'
      ? 'El error pasó a aviso'
      : incident?.resolution_reason === 'monitor_removed'
        ? 'Monitor eliminado'
        : 'Servicio recuperado';
  const duration = formatIncidentDuration(incident);

  return (
    <article className={`incident-timeline-card severity-${severity} ${open ? 'open' : 'resolved'}`}>
      <header className="incident-timeline-header">
        <h3>{hasEvents ? title : `Incidencia de ${context}`}</h3>
        <span className={`incident-state ${open ? `open severity-${currentSeverity}` : 'resolved'}`}>
          {stateLabel}
        </span>
      </header>

      {hasEvents ? (
        <ol className="incident-timeline">
          {incident.events.map((event, index) => {
            const eventSeverity = event.type === 'recovered'
              ? 'recovered'
              : event.type === 'monitor_removed'
                ? 'neutral'
                : event.severity || severity;
            const messages = Array.isArray(event.messages) ? event.messages : [];

            return (
              <li className={eventSeverity} key={event.id || `${event.observed_at}-${index}`}>
                <strong>{eventLabel(event)}</strong>
                <span>{formatIncidentTimestamp(event.observed_at)}</span>
                {messages.length > 0 && (
                  <ul className="incident-event-messages">
                    {messages.map((message, messageIndex) => (
                      <li key={`${message}-${messageIndex}`}>{message}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <>
          {incident?.last_error?.message && (
            <p className="incident-diagnostic">
              {incident.last_error.message}
            </p>
          )}

          <ol className="incident-timeline">
            <li className="error">
              <strong>Error detectado</strong>
              <span>{formatIncidentTimestamp(incident?.first_failed_at)}</span>
            </li>
            <li className={open
              ? 'ongoing'
              : incident?.resolution_reason === 'warning'
                ? 'warning'
                : incident?.resolution_reason === 'monitor_removed'
                  ? 'neutral'
                  : 'recovered'}>
              <strong>{endLabel}</strong>
              <span>
                {open
                  ? formatIncidentTimestamp(incident?.last_failed_at)
                  : formatIncidentTimestamp(incident?.resolved_at)}
              </span>
            </li>
          </ol>
        </>
      )}

      <footer className="incident-timeline-footer">
        <span>{hasEvents ? `${count} observaciones` : `${count} fallos consecutivos`}</span>
        {duration && <span>{duration}</span>}
      </footer>
    </article>
  );
};

export default IncidentTimelineCard;
