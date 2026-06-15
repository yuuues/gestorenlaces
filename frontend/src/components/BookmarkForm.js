import React, { useState } from 'react';
import Modal from './Modal';
import { createBookmark, updateBookmark } from '../api';
import { useEditMode } from '../EditModeContext';

const NEW_CATEGORY = '__new__';

// Add/edit form for a bookmark. `bookmark` is the record to edit, or null to create.
// Calls onSaved() after a successful write so the parent can reload from the API.
function BookmarkForm({ bookmark, categories, onClose, onSaved }) {
  const { lock } = useEditMode();
  const [category, setCategory] = useState(bookmark ? bookmark.category : (categories[0] || NEW_CATEGORY));
  const [newCategory, setNewCategory] = useState('');
  const [shortDescription, setShortDescription] = useState(bookmark ? bookmark.short_description : '');
  const [longDescription, setLongDescription] = useState(bookmark ? bookmark.long_description || '' : '');
  const [link, setLink] = useState(bookmark ? bookmark.link : '');
  const [icon, setIcon] = useState(bookmark ? bookmark.icon || '' : '');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const resolvedCategory = category === NEW_CATEGORY ? newCategory.trim() : category;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resolvedCategory || !shortDescription.trim() || !link.trim()) {
      setError('Categoría, descripción corta y enlace son obligatorios.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      category: resolvedCategory,
      short_description: shortDescription.trim(),
      long_description: longDescription.trim(),
      link: link.trim(),
      icon: icon.trim()
    };
    try {
      if (bookmark) {
        await updateBookmark(bookmark.id, payload);
      } else {
        await createBookmark(payload);
      }
      onSaved();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock(); // key invalid/changed: drop edit mode so the user re-unlocks
        setError('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        setError(err.response?.data?.error || 'No se pudo guardar.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={bookmark ? 'Editar enlace' : 'Añadir enlace'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label>Categoría</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value={NEW_CATEGORY}>+ Nueva categoría…</option>
        </select>
        {category === NEW_CATEGORY && (
          <input
            type="text"
            placeholder="Nombre de la nueva categoría"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
        )}
        <label>Descripción corta</label>
        <input type="text" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
        <label>Descripción larga</label>
        <textarea value={longDescription} onChange={(e) => setLongDescription(e.target.value)} rows={3} />
        <label>Enlace</label>
        <input type="text" value={link} onChange={(e) => setLink(e.target.value)} />
        <label>Icono (opcional, p.ej. "globe" o "fab fa-github")</label>
        <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} />
        {error && <div className="error-message">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={submitting}>{bookmark ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default BookmarkForm;
