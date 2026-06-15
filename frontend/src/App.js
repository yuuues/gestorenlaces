import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import './App.css';
import { EditModeProvider } from './EditModeContext';
import BookmarksView from './views/BookmarksView';
import ServerHealth from './components/ServerHealth';
import McpList from './components/McpList';
import UnlockControl from './components/UnlockControl';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookmark, faServer, faPlug } from '@fortawesome/free-solid-svg-icons';

function App() {
  return (
    <EditModeProvider>
      <BrowserRouter>
        <div className="app">
          <header className="app-header">
            <h1>Bookmarks Manager</h1>
            <div className="view-tabs">
              <NavLink to="/" end className={({ isActive }) => `view-tab ${isActive ? 'active' : ''}`}>
                <FontAwesomeIcon icon={faBookmark} /> Bookmarks
              </NavLink>
              <NavLink to="/health" className={({ isActive }) => `view-tab ${isActive ? 'active' : ''}`}>
                <FontAwesomeIcon icon={faServer} /> Server Health
              </NavLink>
              <NavLink to="/mcps" className={({ isActive }) => `view-tab ${isActive ? 'active' : ''}`}>
                <FontAwesomeIcon icon={faPlug} /> MCPs
              </NavLink>
              <UnlockControl />
            </div>
          </header>
          <Routes>
            <Route path="/" element={<BookmarksView />} />
            <Route path="/health" element={<main className="main-content full-width"><ServerHealth /></main>} />
            <Route path="/mcps" element={<main className="main-content full-width"><McpList /></main>} />
            <Route path="/mcps/:folder" element={<main className="main-content full-width"><McpList /></main>} />
          </Routes>
        </div>
      </BrowserRouter>
    </EditModeProvider>
  );
}

export default App;
