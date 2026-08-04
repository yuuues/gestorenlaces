import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getHealthStatus,
  getHealthIncidents,
  getServers,
  triggerHealthCheck,
  deleteServer
} from '../api';
import { useEditMode } from '../EditModeContext';
import ServerForm from './ServerForm';
import IncidentTimelineCard from './IncidentTimelineCard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faCheckCircle,
  faChevronDown,
  faChevronUp,
  faPenToSquare,
  faPlus,
  faSync,
  faTriangleExclamation,
  faTimesCircle,
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

const formatTimestamp = (value) => {
  if (!value) return 'Pendiente';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('es-ES');
};

const statusPresentation = (status) => {
  if (status === 'ok') {
    return { className: 'status-ok', label: 'OK', icon: faCheckCircle };
  }
  if (status === 'warning') {
    return {
      className: 'status-warning',
      label: 'Aviso',
      icon: faTriangleExclamation
    };
  }
  if (status === 'unknown') {
    return {
      className: 'status-unknown',
      label: 'Pendiente',
      icon: faTimesCircle
    };
  }
  return {
    className: 'status-error',
    label: 'Error',
    icon: faTimesCircle
  };
};

const ServerHealth = () => {
  const [monitorStatus, setMonitorStatus] = useState(EMPTY_STATUS);
  const [incidents, setIncidents] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [expandedComponents, setExpandedComponents] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const { editMode, lock } = useEditMode();

  const loadDashboard = useCallback(async () => {
    try {
      const [statusResponse, incidentsResponse] = await Promise.all([
        getHealthStatus(),
        getHealthIncidents(20)
      ]);
      setMonitorStatus(statusResponse.data || EMPTY_STATUS);
      setIncidents(incidentsResponse.data || []);
      setError(null);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          'No se pudo consultar el monitor.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadServers = useCallback(async () => {
    try {
      const response = await getServers();
      setServers(response.data || []);
    } catch (err) {
      console.error('Error fetching servers:', err);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadServers();
    const visualRefresh = setInterval(loadDashboard, 30000);
    return () => clearInterval(visualRefresh);
  }, [loadDashboard, loadServers]);

  useEffect(() => {
    const nextExpanded = {};
    Object.entries(monitorStatus.servers || {}).forEach(
      ([serverName, serverData]) => {
        Object.entries(serverData.components || {}).forEach(
          ([componentName, componentData]) => {
            nextExpanded[`${serverName}-${componentName}`] =
              componentData?.status !== 'ok';
          }
        );
      }
    );
    setExpandedComponents(nextExpanded);
  }, [monitorStatus]);

  const toggleComponentExpansion = (serverName, componentName) => {
    const key = `${serverName}-${componentName}`;
    setExpandedComponents((current) => ({
      ...current,
      [key]: !current[key]
    }));
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
    if (!window.confirm(`¿Borrar el servidor "${server.name}"?`)) return;
    try {
      await deleteServer(server.id);
      await Promise.all([loadServers(), loadDashboard()]);
    } catch (err) {
      if (err.response?.status === 401) {
        lock();
        alert('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        alert(err.response?.data?.error || 'No se pudo borrar.');
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const response = await triggerHealthCheck();
      setMonitorStatus(response.data || EMPTY_STATUS);
      const incidentsResponse = await getHealthIncidents(20);
      setIncidents(incidentsResponse.data || []);
      setError(null);
    } catch (err) {
      if (err.response?.status === 401) {
        lock();
        setError('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        setError(
          err.response?.data?.error ||
            err.message ||
            'No se pudo ejecutar la comprobación.'
        );
      }
    } finally {
      setChecking(false);
    }
  };

  const snapshotServers = monitorStatus.servers || {};
  const monitorState =
    monitorStatus.state ||
    (monitorStatus.started
      ? monitorStatus.lastError
        ? 'degraded'
        : 'active'
      : 'stopped');
  const visibleServers =
    Object.keys(snapshotServers).length > 0
      ? snapshotServers
      : Object.fromEntries(
          servers.map((server) => [
            server.name,
            {
              serverId: server.id,
              name: server.name,
              url: server.url,
              status: 'unknown',
              components: {},
              info: { connection: 'Pendiente de la primera comprobación' }
            }
          ])
        );

  if (loading) {
    return <div className="loading">Cargando estado del monitor...</div>;
  }

  return (
    <div className="server-health-container">
      <div className="server-health-header">
        <div>
          <h2>Control de servicios</h2>
          <p className="server-health-subtitle">
            Vigilancia autónoma desde el backend
          </p>
        </div>
        <div className="refresh-controls">
          {editMode && (
            <>
              <button className="add-button" onClick={openAdd}>
                <FontAwesomeIcon icon={faPlus} /> Añadir servidor
              </button>
              <button
                className="check-now-button"
                onClick={handleCheckNow}
                disabled={checking}
              >
                <FontAwesomeIcon icon={faBolt} />
                {checking ? 'Comprobando...' : 'Comprobar ahora'}
              </button>
            </>
          )}
          <button
            className="refresh-button"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={faSync} spin={refreshing} />
            Actualizar vista
          </button>
        </div>
      </div>

      <section className="monitor-summary" aria-label="Estado del monitor">
        <span
          className={`monitor-badge ${monitorState}`}
        >
          {monitorStatus.running
            ? 'Comprobando servicios'
            : monitorState === 'degraded'
              ? 'Monitor degradado'
              : monitorState === 'active'
              ? 'Monitor activo'
              : 'Monitor no disponible'}
        </span>
        <span>
          <strong>Última comprobación:</strong>{' '}
          {formatTimestamp(monitorStatus.lastRunAt)}
        </span>
        <span>
          <strong>Próxima comprobación:</strong>{' '}
          {formatTimestamp(monitorStatus.nextRunAt)}
        </span>
      </section>

      {error && <div className="error-message compact">{error}</div>}
      {monitorStatus.lastError && (
        <div className="error-message compact">
          {monitorStatus.lastError}
        </div>
      )}

      {Object.keys(visibleServers).length === 0 ? (
        <div className="no-servers">
          No hay servidores configurados para monitorizar.
        </div>
      ) : (
        <div className="server-list">
          {Object.entries(visibleServers).map(
            ([serverName, serverData]) => {
              const record = servers.find(
                (server) =>
                  server.id === serverData.serverId ||
                  server.name === serverData.name
              );
              const storedIncident =
                serverData.incident &&
                serverData.incident.status !== 'pending'
                  ? serverData.incident
                  : incidents.find(
                      (incident) =>
                        incident.server_id === serverData.serverId
                    );
              const serverStatus = statusPresentation(serverData.status);

              return (
                <article key={serverName} className="server-card">
                  <div className="server-header">
                    <h3>{serverData.name}</h3>
                    <span
                      className={`status-badge ${serverStatus.className}`}
                    >
                      <FontAwesomeIcon
                        icon={serverStatus.icon}
                      />
                      {serverStatus.label}
                    </span>
                    {editMode && record && (
                      <span className="server-actions">
                        <button
                          className="icon-button"
                          onClick={() => openEdit(record)}
                          title="Editar"
                        >
                          <FontAwesomeIcon icon={faPenToSquare} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => handleDelete(record)}
                          title="Borrar"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </span>
                    )}
                  </div>

                  <div className="server-info">
                    <p>
                      <strong>URL:</strong>{' '}
                      {serverData.url || serverData.info?.url || 'N/A'}
                    </p>
                    <p>
                      <strong>Conexión:</strong>{' '}
                      {serverData.info?.connection || 'N/A'}
                    </p>
                    <p>
                      <strong>Comprobado:</strong>{' '}
                      {formatTimestamp(serverData.checkedAt)}
                    </p>
                  </div>

                  {(serverData.serverId || record?.id) && (
                    <Link
                      className="server-card-history-link"
                      to={`/health/servers/${serverData.serverId || record.id}/history`}
                    >
                      Ver histórico
                    </Link>
                  )}

                  {storedIncident && (
                    <IncidentTimelineCard
                      incident={storedIncident}
                      serverName={serverData.name}
                    />
                  )}

                  {Object.keys(serverData.components || {}).length > 0 && (
                    <div className="server-components">
                      <h4>Componentes</h4>
                      {Object.entries(serverData.components).map(
                        ([componentName, componentData]) => {
                          const key = `${serverName}-${componentName}`;
                          const componentStatus = statusPresentation(
                            componentData?.status
                          );
                          return (
                            <div key={componentName} className="component-item">
                              <button
                                type="button"
                                className="component-header"
                                onClick={() =>
                                  toggleComponentExpansion(
                                    serverName,
                                    componentName
                                  )
                                }
                              >
                                <span className="component-name">
                                  {componentData?.name || componentName}
                                </span>
                                <span className="component-status">
                                  <span
                                    className={`status-badge ${componentStatus.className}`}
                                  >
                                    <FontAwesomeIcon
                                      icon={componentStatus.icon}
                                    />
                                    {componentStatus.label}
                                  </span>
                                  <FontAwesomeIcon
                                    icon={
                                      expandedComponents[key]
                                        ? faChevronUp
                                        : faChevronDown
                                    }
                                  />
                                </span>
                              </button>
                              {expandedComponents[key] && (
                                <div className="component-content">
                                  {componentData?.info && (
                                    <div className="component-info">
                                      {Object.entries(componentData.info).map(
                                        ([infoKey, value]) => (
                                          <p key={infoKey}>
                                            <strong>{infoKey}:</strong>{' '}
                                            {typeof value === 'object'
                                              ? value?.message ||
                                                JSON.stringify(value)
                                              : String(value)}
                                          </p>
                                        )
                                      )}
                                    </div>
                                  )}
                                  {componentData?.errors?.length > 0 && (
                                    <div className="component-errors">
                                      <h5>Errores</h5>
                                      <ul>
                                        {componentData.errors.map(
                                          (componentError, index) => (
                                            <li key={index}>
                                              {typeof componentError ===
                                              'string'
                                                ? componentError
                                                : componentError?.message ||
                                                  JSON.stringify(
                                                    componentError
                                                  )}
                                            </li>
                                          )
                                        )}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}
                </article>
              );
            }
          )}
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
