import React, { useState, useEffect } from 'react';
import {
  getCategories, getBookmarks, deleteBookmark,
  deleteCategory, reorderCategories,
} from '../api';
import CategoryNav from '../components/CategoryNav';
import BookmarkList from '../components/BookmarkList';
import BookmarkForm from '../components/BookmarkForm';
import CategoryForm from '../components/CategoryForm';
import { useEditMode } from '../EditModeContext';

function BookmarksView() {
  const [categories, setCategories] = useState([]);      // [{ id, name, position }]
  const [bookmarks, setBookmarks] = useState([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);  // name string
  const [searchQuery, setSearchQuery] = useState('');

  const { editMode, lock } = useEditMode();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  const categoryNames = categories.map((c) => c.name);

  const reload = () => { loadCategories(); loadBookmarks(); };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (bookmark) => { setEditing(bookmark); setFormOpen(true); };
  const handleSaved = () => { setFormOpen(false); setEditing(null); reload(); };

  const openAddCategory = () => { setEditingCategory(null); setCategoryFormOpen(true); };
  const openEditCategory = (category) => { setEditingCategory(category); setCategoryFormOpen(true); };
  const handleCategorySaved = () => { setCategoryFormOpen(false); setEditingCategory(null); reload(); };

  // Manejo común de errores de escritura: salir de editMode en 401, si no, alerta.
  const handleWriteError = (err, fallback) => {
    if (err.response && err.response.status === 401) {
      lock();
      alert('Sesión de edición caducada. Vuelve a desbloquear.');
    } else {
      alert(err.response?.data?.error || fallback);
    }
  };

  const handleDelete = async (bookmark) => {
    if (!window.confirm(`¿Borrar "${bookmark.short_description}"?`)) return;
    try {
      await deleteBookmark(bookmark.id);
      reload();
    } catch (err) {
      handleWriteError(err, 'No se pudo borrar.');
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`¿Borrar la categoría "${category.name}"?`)) return;
    try {
      await deleteCategory(category.id);
      reload();
    } catch (err) {
      handleWriteError(err, 'No se pudo borrar la categoría.');
    }
  };

  const handleMoveCategory = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const ids = categories.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderCategories(ids);
      reload();
    } catch (err) {
      handleWriteError(err, 'No se pudo reordenar.');
    }
  };

  const loadCategories = async () => {
    try {
      const response = await getCategories();
      setCategories(response.data);
      const names = response.data.map((c) => c.name);
      setSelectedCategory((prev) => (prev && names.includes(prev) ? prev : (names[0] || null)));
    } catch (err) {
      setError('Failed to fetch categories. Please try again later.');
      console.error('Error fetching categories:', err);
    }
  };

  const loadBookmarks = async () => {
    try {
      const response = await getBookmarks();
      setBookmarks(response.data);
    } catch (err) {
      setError('Failed to fetch bookmarks. Please try again later.');
      console.error('Error fetching bookmarks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    loadBookmarks();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredBookmarks(bookmarks);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredBookmarks(bookmarks.filter((b) =>
        b.short_description.toLowerCase().includes(q) ||
        (b.long_description && b.long_description.toLowerCase().includes(q)) ||
        b.link.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q)
      ));
    }
  }, [searchQuery, bookmarks]);

  return (
    <>
      <div className="search-container">
        <input
          type="text"
          placeholder="Buscar enlaces..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {editMode && (
          <button className="add-button" onClick={openAdd}>+ Añadir enlace</button>
        )}
      </div>
      <div className="app-content">
        <CategoryNav
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          editMode={editMode}
          onAddCategory={openAddCategory}
          onEditCategory={openEditCategory}
          onDeleteCategory={handleDeleteCategory}
          onMoveCategory={handleMoveCategory}
        />
        <main className="main-content">
          {error && <div className="error-message">{error}</div>}
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <BookmarkList
              bookmarks={filteredBookmarks}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              categories={categoryNames}
              editMode={editMode}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          )}
        </main>
      </div>
      {formOpen && (
        <BookmarkForm
          bookmark={editing}
          categories={categoryNames}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
      {categoryFormOpen && (
        <CategoryForm
          category={editingCategory}
          onClose={() => { setCategoryFormOpen(false); setEditingCategory(null); }}
          onSaved={handleCategorySaved}
        />
      )}
    </>
  );
}

export default BookmarksView;
