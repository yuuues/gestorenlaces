import React, { useState } from 'react';
import Modal from './Modal';
import { createCategory, renameCategory } from '../api';
import { useEditMode } from '../EditModeContext';

// Alta/renombrado de categoría. `category` es el {id, name} a renombrar, o null para crear.
// Llama a onSaved() tras un guardado correcto para que el padre recargue desde la API.
function CategoryForm({ category, onClose, onSaved }) {
  const { lock } = useEditMode();
  const [name, setName] = useState(category ? category.name : '');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (category) {
        await renameCategory(category.id, trimmed);
      } else {
        await createCategory(trimmed);
      }
      onSaved();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock();
        setError('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        setError(err.response?.data?.error || 'No se pudo guardar.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={category ? 'Renombrar categoría' : 'Añadir categoría'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label>Nombre</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        {error && <div className="error-message">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={submitting}>{category ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default CategoryForm;
