import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CategoryNav.css';

function CategoryNav({ categories, selectedCategory, onSelectCategory, onNavigate, modules = [] }) {
  const [modulePassword, setModulePassword] = useState('');
  const [passwordValid, setPasswordValid] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');

  // Check if password is stored in localStorage on component mount
  useEffect(() => {
    const storedPassword = localStorage.getItem('moduleConfigPassword');
    if (storedPassword) {
      setModulePassword(storedPassword);
      validatePassword(storedPassword);
    }
  }, []);

  const scrollToCategory = (category) => {
    // Update the selected category in the parent component
    onSelectCategory(category);

    // Scroll to the category section
    const element = document.getElementById(`category-${category}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handlePasswordChange = (e) => {
    setModulePassword(e.target.value);
    setError('');
  };

  const validatePassword = async (password) => {
    setValidating(true);
    setError('');

    try {
      const response = await axios.post('/api/modules/validate-password', {}, {
        headers: {
          'module-config-password': password
        }
      });

      if (response.data.valid) {
        setPasswordValid(true);
        localStorage.setItem('moduleConfigPassword', password);
      } else {
        setPasswordValid(false);
        setError('Invalid password');
      }
    } catch (err) {
      console.error('Error validating password:', err);
      setPasswordValid(false);
      setError('Error validating password');
    } finally {
      setValidating(false);
    }
  };

  const handleSubmitPassword = (e) => {
    e.preventDefault();
    validatePassword(modulePassword);
  };

  const handleModuleClick = (screen) => {
    if (screen === 'tipos' || screen === 'calendario') {
      // These screens require password validation
      if (passwordValid) {
        onNavigate(screen);
      } else {
        setError('Please enter a valid password to access this module');
      }
    } else {
      // Other screens don't require password validation
      onNavigate(screen);
    }
  };

  return (
    <nav className="category-nav">
      {/* Module links section */}
      {onNavigate && (
        <div className="module-links">
          <h2>Modules</h2>

          <form onSubmit={handleSubmitPassword} className="module-password-form">
            <input
              type="password"
              placeholder="Enter module password"
              value={modulePassword}
              onChange={handlePasswordChange}
              className="module-password-input"
            />
            <button 
              type="submit" 
              className="module-password-button"
              disabled={validating}
            >
              {validating ? 'Validating...' : 'Validate'}
            </button>
          </form>

          {error && <div className="module-password-error">{error}</div>}
          {passwordValid && <div className="module-password-success">Password validated successfully</div>}

          <ul className="module-list">
            <li onClick={() => handleModuleClick('empleados')}>
              Employee Management
            </li>
            <li onClick={() => handleModuleClick('tipos')}>
              Holiday Types {!passwordValid && <span className="lock-icon">🔒</span>}
            </li>
            <li onClick={() => handleModuleClick('calendario')}>
              Annual Calendar {!passwordValid && <span className="lock-icon">🔒</span>}
            </li>
            <li onClick={() => handleModuleClick('festivos')}>
              Employee Holidays
            </li>
          </ul>
        </div>
      )}

      <h2>Categories</h2>
      <ul className="category-list">
        {categories.map((category) => (
          <li 
            key={category}
            className={category === selectedCategory ? 'active' : ''}
            onClick={() => scrollToCategory(category)}
          >
            {category}
          </li>
        ))}
      </ul>
      <div className="category-footer">
        <p><a href="https://yuuu.es" target="_blank" rel="noopener noreferrer">Powered & Developed by Yuuu</a></p>
      </div>
    </nav>
  );
}

export default CategoryNav;
