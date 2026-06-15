import React, { useState, useEffect } from 'react';
import { getCategories, getBookmarks, deleteBookmark } from '../api';
import CategoryNav from '../components/CategoryNav';
import BookmarkList from '../components/BookmarkList';
import BookmarkForm from '../components/BookmarkForm';
import { useEditMode } from '../EditModeContext';

function BookmarksView() {
  const [categories, setCategories] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { editMode, lock } = useEditMode();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const reload = () => { loadCategories(); loadBookmarks(); };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (bookmark) => { setEditing(bookmark); setFormOpen(true); };
  const handleSaved = () => { setFormOpen(false); setEditing(null); reload(); };

  const handleDelete = async (bookmark) => {
    if (!window.confirm(`¿Borrar "${bookmark.short_description}"?`)) return;
    try {
      await deleteBookmark(bookmark.id);
      reload();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock();
        alert('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        alert(err.response?.data?.error || 'No se pudo borrar.');
      }
    }
  };

  const loadCategories = async () => {
    try {
      const response = await getCategories();
      setCategories(response.data);
      if (response.data.length > 0) {
        setSelectedCategory((prev) => prev || response.data[0]);
      }
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
              categories={categories}
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
          categories={categories}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

export default BookmarksView;
