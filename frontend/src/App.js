import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import CategoryNav from './components/CategoryNav';
import BookmarkList from './components/BookmarkList';

function App() {
  const [categories, setCategories] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await axios.get('/api/categories');
        setCategories(response.data);
        if (response.data.length > 0) {
          setSelectedCategory(response.data[0]);
        }
      } catch (err) {
        setError('Failed to fetch categories. Please try again later.');
        console.error('Error fetching categories:', err);
      }
    };

    fetchCategories();
  }, []);

  // Fetch bookmarks when selected category changes
  useEffect(() => {
    const fetchBookmarks = async () => {
      if (!selectedCategory) return;

      setLoading(true);
      try {
        const response = await axios.get(`/api/bookmarks/category/${selectedCategory}`);
        setBookmarks(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch bookmarks. Please try again later.');
        console.error('Error fetching bookmarks:', err);
        setLoading(false);
      }
    };

    fetchBookmarks();
  }, [selectedCategory]);

  // Filter bookmarks based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredBookmarks(bookmarks);
    } else {
      const filtered = bookmarks.filter(bookmark => 
        bookmark.short_description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (bookmark.long_description && bookmark.long_description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        bookmark.link.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredBookmarks(filtered);
    }
  }, [searchQuery, bookmarks]);

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Bookmarks Manager</h1>
        <div className="search-container">
          <input
            type="text"
            placeholder="Buscar enlaces..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="search-input"
          />
        </div>
      </header>
      <div className="app-content">
        <CategoryNav 
          categories={categories} 
          selectedCategory={selectedCategory}
          onSelectCategory={handleCategorySelect}
        />
        <main className="main-content">
          {error && <div className="error-message">{error}</div>}
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <BookmarkList 
              bookmarks={filteredBookmarks} 
              category={selectedCategory} 
              searchQuery={searchQuery}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
