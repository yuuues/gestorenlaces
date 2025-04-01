import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api from './api';
import './App.css';
import CategoryNav from './components/CategoryNav';
import BookmarkList from './components/BookmarkList';
import EmployeeStatus from './components/EmployeeStatus';

// Import module screens
import EmpleadosScreen from './components/calendario/EmpleadosScreen';
import TipoFestivoScreen from './components/calendario/TipoFestivoScreen';
import CalendarioAnualScreen from './components/calendario/CalendarioAnualScreen';
import FestivosScreen from './components/calendario/FestivosScreen';

function App() {
  const [categories, setCategories] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentScreen, setCurrentScreen] = useState('home');
  const [modules, setModules] = useState([]);

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

  // Fetch all bookmarks on component mount
  useEffect(() => {
    const fetchAllBookmarks = async () => {
      setLoading(true);
      try {
        const response = await axios.get('/api/bookmarks');
        setBookmarks(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch bookmarks. Please try again later.');
        console.error('Error fetching bookmarks:', err);
        setLoading(false);
      }
    };

    fetchAllBookmarks();
  }, []);

  // Fetch available modules
  useEffect(() => {
    const fetchModules = async () => {
      try {
        const response = await api.get('/api/modules');
        setModules(response.data);
      } catch (err) {
        console.error('Error fetching modules:', err);
      }
    };

    fetchModules();
  }, []);

  // Filter bookmarks based on search query across all bookmarks
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredBookmarks(bookmarks);
    } else {
      const filtered = bookmarks.filter(bookmark => 
        bookmark.short_description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (bookmark.long_description && bookmark.long_description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        bookmark.link.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bookmark.category.toLowerCase().includes(searchQuery.toLowerCase())
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

  // Handle navigation to a module screen
  const handleNavigate = (screen) => {
    setCurrentScreen(screen);
  };

  // Handle back navigation from a module screen
  const handleBack = () => {
    setCurrentScreen('home');
  };

  // Render the appropriate screen based on currentScreen state
  const renderScreen = () => {
    switch (currentScreen) {
      case 'empleados':
        return <EmpleadosScreen onBack={handleBack} />;
      case 'tipos':
        return <TipoFestivoScreen onBack={handleBack} />;
      case 'calendario':
        return <CalendarioAnualScreen onBack={handleBack} />;
      case 'festivos':
        return <FestivosScreen onBack={handleBack} />;
      case 'home':
      default:
        return (
          <>
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
                onNavigate={handleNavigate}
                modules={modules}
              />
              <main className="main-content">
                {error && <div className="error-message">{error}</div>}
                {loading ? (
                  <div className="loading">Loading...</div>
                ) : (
                  <>
                    <EmployeeStatus />
                    <BookmarkList 
                      bookmarks={filteredBookmarks} 
                      selectedCategory={selectedCategory}
                      searchQuery={searchQuery}
                      categories={categories}
                    />
                  </>
                )}
              </main>
            </div>
          </>
        );
    }
  };

  return (
    <div className="app">
      {renderScreen()}
    </div>
  );
}

export default App;
