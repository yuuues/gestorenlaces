import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getHealthStatus,
  getHealthStatusHistory,
  getServers,
  triggerHealthCheck,
  deleteServer
} from '../api';
import { useEditMode } from '../EditModeContext';
import ServerForm from './ServerForm';
import ServerStatusStrip from './ServerStatusStrip';
import CurrentCheckIssues from './CurrentCheckIssues';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faPenToSquare,
  faPlus,
  faRotate,
  faTrash
} from '@fortawesome/free-solid-svg-icons';
import './ServerHealth.css';

const EMPTY_STATUS = {
  state: 'stopped',
  started: false,
  running: false,
  lastRunAt: null,
  nextRunAt: null,
  lastError: null,
  servers: {}
};

const CURRENT_STATE = {
  ok: { className: 'ok', label: 'Operativo' },
  warning: { className: 'warning', label: 'Parcialmente degradado' },
  error: { className: 'error', label: 'Servicio degradado' },
  unknown: { className: 'unknown', label: 'Pendiente' }
};

const formatTimestamp = (value) => {
  if (!value) return 'Pendiente';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('es-ES');
};

const errorMessage = (error, fallback) =>
  error?.response?.data?.error || error?.message || fallback;

const ServerHealth = () => {
  const [monitorStatus, setMonitorStatus] = useState(EMPTY_STATUS);
  const [historyByServer, setHistoryByServer] = useState({});
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const { editMode, lock } = useEditMode();

  const applyHistory = useCallback((response) => {
    setHistoryByServer(
      Object.fromEntries(
        (response?.data?.servers || []).map((entry) => [
          entry.serverId,
          entry
        ])
      )
    );
    setHistoryUnavailable(false);
  }, []);

  const loadDashboard = useCallback(async () => {
    const [statusResult, historyResult] = await Promise.allSettled([
      getHealthStatus(),
      getHealthStatusHistory({ hours: 24, bucketMinutes: 15 })
    ]);

    if (statusResult.status === 'rejected') {
      setError(
        errorMessage(
          statusResult.reason,
          'No se pudo consultar el monitor.'
        )
      );
      return;
    }

    setMonitorStatus(statusResult.value.data || EMPTY_STATUS);
    setError(null);
    if (historyResult.status === 'fulfilled') {
      applyHistory(historyResult.value);
    } else {
      setHistoryByServer({});
      setHistoryUnavailable(true);
    }
  }, [applyHistory]);

  const loadServers = useCallback(async () => {
    try {
      const response = await getServers();
      setServers(response.data || []);
    } catch (loadError) {
      setError(
        errorMessage(
          loadError,
          'No se pudieron cargar los servidores configurados.'
        )
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([loadServers(), loadDashboard()]).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [loadDashboard, loadServers]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadServers(), loadDashboard()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const response = await triggerHealthCheck();
      setMonitorStatus(response.data || EMPTY_STATUS);
      setError(null);
      try {
        applyHistory(
          await getHealthStatusHistory({ hours: 24, bucketMinutes: 15 })
        );
      } catch (_historyError) {
        setHistoryByServer({});
        setHistoryUnavailable(true);
      }
    } catch (checkError) {
      if (checkError.response?.status === 401) {
        lock();
        setError('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        setError(
          errorMessage(
            checkError,
            'No se pudo ejecutar la comprobación.'
          )
        );
      }
    } finally {
      setChecking(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (server) => {
    setEditing(server);
    setFormOpen(true);
  };

  const handleSaved = async () => {
    setFormOpen(false);
    setEditing(null);
    await Promise.all([loadServers(), loadDashboard()]);
  };

  const handleDelete = async (server) => {
    if (!window.confirm(`¿Eliminar el servidor "${server.name}"?`)) return;
    try {
      await deleteServer(server.id);
      await Promise.all([loadServers(), loadDashboard()]);
    } catch (deleteError) {
      if (deleteError.response?.status === 401) {
        lock();
        window.alert('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        window.alert(
          errorMessage(deleteError, 'No se pudo borrar el servidor.')
        );
      }
    }
  };

  const snapshotServers = monitorStatus.servers || {};
  const visibleServers = Object.keys(snapshotServers).length > 0
    ? snapshotServers
    : Object.fromEntries(
        servers.map((server) => [
          server.name,
          {
            serverId: server.id,
            name: server.name,
            url: server.url,
            checkedAt: null,
            status: 'unknown',
            components: {},
            error: null,
            warning: null,
            info: {}
          }
        ])
      );
  const monitorState =
    monitorStatus.state ||
    (monitorStatus.started
      ? monitorStatus.lastError
        ? 'degraded'
        : 'active'
      : 'stopped');
  const monitorAlert = monitorState === 'degraded'
    ? { className: 'degraded', label: 'Monitor degradado' }
    : ['stopped', 'unavailable'].includes(monitorState)
      ? { className: 'unavailable', label: 'Monitor no disponible' }
      : null;

  if (loading) {
    return <div className="loading">Cargando estado del monitor...</div>;
  }

  return (
    <div className="server-health-container">
      <div className="server-health-header">
        <div className="server-health-heading">
          <div className="server-health-title-line">
            <h2>Control de servicios</h2>
            {monitorAlert && (
              <span className={`monitor-badge ${monitorAlert.className}`}>
                {monitorAlert.label}
              </span>
            )}
          </div>
          <div className="monitor-metadata" aria-label="Estado del monitor">
            <span>
              <strong>Última comprobación:</strong>{' '}
              {formatTimestamp(monitorStatus.lastRunAt)}
            </span>
            <span>
              <strong>Próxima comprobación:</strong>{' '}
              {formatTimestamp(monitorStatus.nextRunAt)}
            </span>
          </div>
        </div>
        <div className="refresh-controls">
          {editMode && (
            <button className="check-now-button" onClick={handleCheckNow} disabled={checking}>
              <FontAwesomeIcon icon={faBolt} />
              {checking ? 'Comprobando...' : 'Comprobar ahora'}
            </button>
          )}
          <button className="refresh-button" onClick={handleRefresh} disabled={refreshing}>
            <FontAwesomeIcon icon={faRotate} />
            {refreshing ? 'Actualizando...' : 'Actualizar vista'}
          </button>
          {editMode && (
            <button className="add-server-button" onClick={openAdd}>
              <FontAwesomeIcon icon={faPlus} /> Añadir servidor
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message compact">{error}</div>}
      {monitorStatus.lastError && (
        <div className="error-message compact">{monitorStatus.lastError}</div>
      )}

      {Object.keys(visibleServers).length === 0 ? (
        <div className="no-servers">
          No hay servidores configurados para monitorizar.
        </div>
      ) : (
        <div className="server-list">
          {Object.entries(visibleServers).map(([serverName, serverData]) => {
            const record = servers.find(
              (server) =>
                server.id === serverData.serverId ||
                server.name === serverData.name
            );
            const serverId = serverData.serverId || record?.id;
            const currentState =
              CURRENT_STATE[serverData.status] || CURRENT_STATE.unknown;

            return (
              <article key={serverName} className="server-card">
                <header className="server-row-header">
                  <div className="server-identity">
                    <div className="server-title-line">
                      <h3>{serverData.name}</h3>
                      <span className={`server-current-state ${currentState.className}`}>
                        <span className="server-current-state-dot" aria-hidden="true" />
                        {currentState.label}
                      </span>
                    </div>
                    <p className="server-row-meta">
                      <span>{serverData.url}</span>
                      <span>Comprobado: {formatTimestamp(serverData.checkedAt)}</span>
                    </p>
                  </div>
                  {editMode && record && (
                    <span className="server-actions">
                      <button
                        className="icon-button"
                        onClick={() => openEdit(record)}
                        title="Editar"
                        aria-label={`Editar ${record.name}`}
                      >
                        <FontAwesomeIcon icon={faPenToSquare} />
                      </button>
                      <button
                        className="icon-button delete"
                        onClick={() => handleDelete(record)}
                        title="Eliminar"
                        aria-label={`Eliminar ${record.name}`}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </span>
                  )}
                </header>

                <ServerStatusStrip
                  history={historyByServer[serverId]}
                  unavailable={historyUnavailable}
                />
                <CurrentCheckIssues server={serverData} />

                {serverId && (
                  <footer className="server-row-footer">
                    <Link
                      className="server-card-history-link"
                      to={`/health/servers/${serverId}/history`}
                    >
                      Ver histórico
                    </Link>
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}

      {formOpen && (
        <ServerForm
          server={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default ServerHealth;
