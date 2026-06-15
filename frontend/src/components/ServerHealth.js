import React, { useState, useEffect, useRef } from 'react';
import { checkServersHealth, getServers, deleteServer } from '../api';
import { useEditMode } from '../EditModeContext';
import ServerForm from './ServerForm';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faTimesCircle, faSync, faChevronDown, faChevronUp, faPlay, faPause, faPenToSquare, faTrash, faPlus } from '@fortawesome/free-solid-svg-icons';
import './ServerHealth.css';

const ServerHealth = () => {
  const [serverStatus, setServerStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedComponents, setExpandedComponents] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const intervalRef = useRef(null);
  const { editMode, lock } = useEditMode();
  const [servers, setServers] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Note: this intentionally does NOT toggle `loading` on every call. `loading`
  // is only true for the very first load (initial useState); refreshes (manual
  // or auto) reuse the existing view so it doesn't flash "Loading..." each time.
  const fetchServerHealth = async () => {
    setError(null);
    try {
      const response = await checkServersHealth();
      setServerStatus(response.data);
    } catch (err) {
      // Si el error tiene respuesta, podría ser un error controlado del backend
      if (err.response && err.response.data && typeof err.response.data === 'object' && !err.response.data.error) {
        setServerStatus(err.response.data);
      } else {
        const errorMessage = err.message || 'Failed to fetch server health status. Please try again later.';
        setError(errorMessage);
        console.error('Error fetching server health:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadServers = async () => {
    try {
      const response = await getServers();
      setServers(response.data);
    } catch (err) {
      console.error('Error fetching servers:', err);
    }
  };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (server) => { setEditing(server); setFormOpen(true); };
  const handleSaved = () => {
    setFormOpen(false);
    setEditing(null);
    loadServers();
    fetchServerHealth();
  };
  const handleDelete = async (server) => {
    if (!window.confirm(`¿Borrar el servidor "${server.name}"?`)) return;
    try {
      await deleteServer(server.id);
      loadServers();
      fetchServerHealth();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock();
        alert('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        alert(err.response?.data?.error || 'No se pudo borrar.');
      }
    }
  };

  // Initialize expanded state based on component status (error = expanded, ok = collapsed)
  const initializeExpandedState = (data) => {
    const expandedState = {};

    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([serverName, serverData]) => {
        if (serverData && serverData.components) {
          Object.entries(serverData.components).forEach(([componentName, componentData]) => {
            // Create a unique key for each component
            const componentKey = `${serverName}-${componentName}`;
            // Set to expanded if status is error, collapsed if ok
            expandedState[componentKey] = componentData && componentData.status !== 'ok';
          });
        }
      });
    }

    return expandedState;
  };

  // Toggle component expansion
  const toggleComponentExpansion = (serverName, componentName) => {
    const componentKey = `${serverName}-${componentName}`;
    setExpandedComponents(prev => ({
      ...prev,
      [componentKey]: !prev[componentKey]
    }));
  };

  // Toggle auto-refresh
  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled(prev => !prev);
  };

  // Handle refresh interval change
  const handleIntervalChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (value > 0) {
      setRefreshInterval(value);
    }
  };

  // Initial fetch on component mount
  useEffect(() => {
    fetchServerHealth();
    loadServers();
  }, []);

  // Setup or clear interval based on autoRefreshEnabled state
  useEffect(() => {
    if (autoRefreshEnabled && refreshInterval > 0) {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Set new interval
      intervalRef.current = setInterval(() => {
        fetchServerHealth();
      }, refreshInterval * 1000);

      // Return cleanup function
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else if (!autoRefreshEnabled && intervalRef.current) {
      // Clear interval when auto-refresh is disabled
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [autoRefreshEnabled, refreshInterval]);

  // Initialize expanded state when server status changes
  useEffect(() => {
    if (!loading && Object.keys(serverStatus).length > 0) {
      setExpandedComponents(initializeExpandedState(serverStatus));
    }
  }, [serverStatus, loading]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchServerHealth();
    setRefreshing(false);
  };

  if (loading) {
    return <div className="loading">Loading server health status...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="server-health-container">
      <div className="server-health-header">
        <h2>Server Health Status</h2>
        <div className="refresh-controls">
          {editMode && (
            <button className="add-button" onClick={openAdd}>
              <FontAwesomeIcon icon={faPlus} /> Añadir servidor
            </button>
          )}
          <div className="auto-refresh-container">
            <label htmlFor="refreshInterval">Auto-refresh every:</label>
            <input
              id="refreshInterval"
              type="number"
              min="1"
              value={refreshInterval}
              onChange={handleIntervalChange}
              className="refresh-interval-input"
            />
            <span className="seconds-label">seconds</span>
          </div>
          <button 
            className={`auto-refresh-button ${autoRefreshEnabled ? 'active' : ''}`} 
            onClick={toggleAutoRefresh}
            title={autoRefreshEnabled ? "Disable auto-refresh" : "Enable auto-refresh"}
          >
            <FontAwesomeIcon icon={autoRefreshEnabled ? faPause : faPlay} /> 
            {autoRefreshEnabled ? "Stop" : "Start"}
          </button>
          <button 
            className="refresh-button" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={faSync} spin={refreshing} /> Refresh
          </button>
        </div>
      </div>

      {Object.keys(serverStatus).length === 0 ? (
        <div className="no-servers">No servers configured. Please add servers to monitor.</div>
      ) : (
        <div className="server-list">
          {Object.entries(serverStatus).map(([serverName, serverData]) => (
            <div key={serverName} className="server-card">
              <div className="server-header">
                <h3>{serverData.name}</h3>
                <span className={`status-badge ${serverData.status === 'ok' ? 'status-ok' : 'status-error'}`}>
                  <FontAwesomeIcon icon={serverData.status === 'ok' ? faCheckCircle : faTimesCircle} />
                  {serverData.status === 'ok' ? 'OK' : 'Error'}
                </span>
                {editMode && (() => {
                  const record = servers.find((s) => s.name === serverData.name);
                  if (!record) return null;
                  return (
                    <span className="server-actions">
                      <button className="icon-button" onClick={() => openEdit(record)} title="Editar">
                        <FontAwesomeIcon icon={faPenToSquare} />
                      </button>
                      <button className="icon-button" onClick={() => handleDelete(record)} title="Borrar">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </span>
                  );
                })()}
              </div>

              <div className="server-info">
                <p><strong>URL:</strong> {serverData.info?.url || 'N/A'}</p>
                <p><strong>Connection:</strong> {serverData.info?.connection || 'N/A'}</p>
              </div>

              {serverData.components && Object.keys(serverData.components).length > 0 && (
                <div className="server-components">
                  <h4>Components</h4>
                  {Object.entries(serverData.components).map(([componentName, componentData]) => (
                    <div key={componentName} className="component-item">
                      <div 
                        className="component-header" 
                        onClick={() => toggleComponentExpansion(serverName, componentName)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="component-name">{componentData.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span className={`status-badge ${componentData.status === 'ok' ? 'status-ok' : 'status-error'}`}>
                            <FontAwesomeIcon icon={componentData.status === 'ok' ? faCheckCircle : faTimesCircle} />
                            {componentData.status === 'ok' ? 'OK' : 'Error'}
                          </span>
                          <FontAwesomeIcon 
                            icon={expandedComponents[`${serverName}-${componentName}`] ? faChevronUp : faChevronDown} 
                            style={{ marginLeft: '8px', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                      <div 
                        className="component-content"
                        style={{ 
                          maxHeight: expandedComponents[`${serverName}-${componentName}`] ? '500px' : '0',
                          opacity: expandedComponents[`${serverName}-${componentName}`] ? 1 : 0,
                          padding: expandedComponents[`${serverName}-${componentName}`] ? '0 0' : '0',
                          marginTop: expandedComponents[`${serverName}-${componentName}`] ? '0px' : '0'
                        }}
                      >
                        {componentData.info && (
                          <div className="component-info">
                            {Object.entries(componentData.info).map(([key, value]) => (
                              <p key={key}><strong>{key}:</strong> {typeof value === 'object' ? (value?.message || JSON.stringify(value)) : String(value)}</p>
                            ))}
                          </div>
                        )}
                        {componentData.errors && componentData.errors.length > 0 && (
                          <div className="component-errors">
                            <h5>Errors</h5>
                            <ul>
                              {componentData.errors.map((error, index) => (
                                <li key={index}>{typeof error === 'string' ? error : (error && error.message) ? error.message : JSON.stringify(error)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <ServerForm
          server={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default ServerHealth;
