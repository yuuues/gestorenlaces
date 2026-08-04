import React from 'react';
import './CurrentCheckIssues.css';

const ISSUE_RANK = { error: 0, warning: 1 };

export const selectCurrentIssues = (server) =>
  Object.entries(server?.components || {})
    .filter(([, component]) =>
      Object.prototype.hasOwnProperty.call(ISSUE_RANK, component?.status)
    )
    .sort(
      (left, right) =>
        ISSUE_RANK[left[1].status] - ISSUE_RANK[right[1].status]
    );

const displayValue = (value) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') {
    return value.message || JSON.stringify(value);
  }
  return String(value);
};

const IssueCard = ({ name, status, messages = [], info = {} }) => (
  <article className={`current-check-issue ${status}`}>
    <header>
      <strong>{name}</strong>
      <span>{status === 'error' ? 'Error' : 'Aviso'}</span>
    </header>
    {messages.length > 0 && (
      <ul className="current-check-messages">
        {messages.map((message, index) => (
          <li key={`${message}-${index}`}>{message}</li>
        ))}
      </ul>
    )}
    {Object.keys(info).length > 0 && (
      <dl className="current-check-facts">
        {Object.entries(info).map(([key, value]) => (
          <React.Fragment key={key}>
            <dt>{key}</dt>
            <dd>{displayValue(value)}</dd>
          </React.Fragment>
        ))}
      </dl>
    )}
  </article>
);

const CurrentCheckIssues = ({ server }) => {
  const issues = selectCurrentIssues(server);
  if (issues.length > 0) {
    return (
      <section className="current-check-issues" aria-label="Checks con problemas actuales">
        {issues.map(([key, component]) => (
          <IssueCard
            key={key}
            name={component.name || key}
            status={component.status}
            messages={(component.errors || []).map((error) =>
              typeof error === 'string'
                ? error
                : error?.message || JSON.stringify(error)
            )}
            info={component.info || {}}
          />
        ))}
      </section>
    );
  }

  if (server?.status !== 'error' && server?.status !== 'warning') return null;
  const diagnostic = server.error || server.warning || {};
  const connection = server.info?.connection;
  const messages = [...new Set([diagnostic.message, connection].filter(Boolean))];
  return (
    <section className="current-check-issues" aria-label="Problema actual del servidor">
      <IssueCard
        name="Conexión"
        status={server.status}
        messages={messages}
      />
    </section>
  );
};

export default CurrentCheckIssues;
