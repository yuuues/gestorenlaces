import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { useEditMode } from '../EditModeContext';
import { verifyKey } from '../api';

function UnlockControl() {
  const { editMode, unlock, lock } = useEditMode();
  const [showModal, setShowModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyKey(keyInput);
      unlock(keyInput);
      setShowModal(false);
      setKeyInput('');
    } catch (err) {
      setError('Clave incorrecta o gestión deshabilitada.');
    } finally {
      setSubmitting(false);
    }
  };

  if (editMode) {
    return (
      <button className="lock-button active" onClick={lock} title="Bloquear edición">
        <FontAwesomeIcon icon={faLockOpen} /> Edición
      </button>
    );
  }

  return (
    <>
      <button className="lock-button" onClick={() => setShowModal(true)} title="Desbloquear edición">
        <FontAwesomeIcon icon={faLock} />
      </button>
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Desbloquear edición</h3>
            <form onSubmit={handleSubmit}>
              <input
                type="password"
                placeholder="Clave de administrador"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoFocus
              />
              {error && <div className="error-message">{error}</div>}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" disabled={submitting}>Desbloquear</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default UnlockControl;
