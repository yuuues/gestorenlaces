import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getHealthStatus,
  getServerIncidents,
  getServers
} from '../api';
import IncidentTimelineCard from './IncidentTimelineCard';
import './ServerHistory.css';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { status: '', days: '', component: '' };

const statusLabel = (status) => {
  if (status === 'ok') return 'OK';
  if (status === 'warning') return 'Aviso';
  if (status === 'error') return 'Error';
  return 'Pendiente';
};

const ServerHistory = () => {
  const { serverId } = useParams();
  const numericServerId = Number.parseInt(serverId, 10);
  const [server, setServer] = useState(null);
  const [currentStatus, setCurrentStatus] = useState('unknown');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([getServers(), getHealthStatus()])
      .then(([serversResponse, statusResponse]) => {
        if (!active) return;
        const found = (serversResponse.data || []).find(
          (entry) => entry.id === numericServerId
        );
        setServer(found || null);
        const snapshot = Object.values(
          statusResponse.data?.servers || {}
        ).find(
          (entry) =>
            entry.serverId === numericServerId ||
            (found && entry.name === found.name)
        );
        setCurrentStatus(snapshot?.status || 'unknown');
      })
      .catch(() => {
        if (active) setServer(null);
      });
    return () => {
      active = false;
    };
  }, [numericServerId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getServerIncidents(numericServerId, {
      limit: PAGE_SIZE,
      offset,
      status: filters.status,
      days: filters.days === '' ? '' : Number(filters.days),
      component: filters.component
    })
      .then((response) => {
        if (!active) return;
        setItems(response.data?.items || []);
        setTotal(response.data?.total || 0);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setError('No se pudo cargar el histórico del servidor.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [numericServerId, offset, filters]);

  const applyFilters = (event) => {
    event.preventDefault();
    setOffset(0);
    setFilters({
      status: draftFilters.status,
      days: draftFilters.days,
      component: draftFilters.component.trim()
    });
  };

  const updateFilter = (field) => (event) => {
    setDraftFilters((current) => ({
      ...current,
      [field]: event.target.value
    }));
  };

  const displayName = server?.name || `Servidor ${serverId}`;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <section className="server-history-page">
      <Link className="server-history-back" to="/health">
        ← Volver a servidores
      </Link>

      <header className="server-history-heading">
        <div>
          <p className="server-history-eyebrow">Histórico de incidencias</p>
          <h2>{displayName} · Histórico</h2>
          <p>{total} registros históricos</p>
        </div>
        <span className={`history-current-state ${currentStatus}`}>
          Estado actual: {statusLabel(currentStatus)}
        </span>
      </header>

      <form className="server-history-filters" onSubmit={applyFilters}>
        <label>
          Estado
          <select
            value={draftFilters.status}
            onChange={updateFilter('status')}
          >
            <option value="">Todos</option>
            <option value="open">Abiertas</option>
            <option value="resolved">Resueltas</option>
          </select>
        </label>
        <label>
          Periodo
          <select
            value={draftFilters.days}
            onChange={updateFilter('days')}
          >
            <option value="">Todo el histórico</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </label>
        <label>
          Componente
          <input
            type="text"
            value={draftFilters.component}
            onChange={updateFilter('component')}
            placeholder="db, core..."
          />
        </label>
        <button type="submit">Aplicar filtros</button>
      </form>

      {error && <div className="server-history-error">{error}</div>}
      {loading ? (
        <div className="server-history-empty">Cargando histórico...</div>
      ) : items.length === 0 && !error ? (
        <div className="server-history-empty">
          Este servidor todavía no tiene avisos ni incidencias registrados.
        </div>
      ) : (
        <div className="incident-history-list">
          {items.map((entry) => (
            <IncidentTimelineCard
              key={entry.id}
              incident={entry}
              serverName={displayName}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <nav
          className="server-history-pagination"
          aria-label="Paginación del histórico"
        >
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          >
            Anterior
          </button>
          <span>
            {pageStart}–{pageEnd} de {total}
          </span>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
          >
            Siguiente
          </button>
        </nav>
      )}
    </section>
  );
};

export default ServerHistory;
