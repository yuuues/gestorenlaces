import React, { useState } from 'react';
import Modal from './Modal';
import { createServer, updateServer } from '../api';
import { useEditMode } from '../EditModeContext';

// Add/edit form for a monitored server. `server` is the record to edit, or null to create.
function ServerForm({ server, onClose, onSaved }) {
  const { lock } = useEditMode();
  const [name, setName] = useState(server ? server.name : '');
  const [url, setUrl] = useState(server ? server.url : '');
  const [description, setDescription] = useState(server ? server.description || '' : '');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError('Nombre y URL son obligatorios.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = { name: name.trim(), url: url.trim(), description: description.trim() };
    try {
      if (server) {
        await updateServer(server.id, payload);
      } else {
        await createServer(payload);
      }
      onSaved();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock(); // key invalid/changed: drop edit mode so the user re-unlocks
        setError('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        setError(err.response?.data?.error || 'No se pudo guardar (¿nombre duplicado?).');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={server ? 'Editar servidor' : 'Añadir servidor'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label>Nombre</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <label>URL (endpoint /health)</label>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} />
        <label>Descripción</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <div className="error-message">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={submitting}>{server ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default ServerForm;
