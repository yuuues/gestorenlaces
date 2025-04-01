import React from 'react';
import './CategoryNav.css';

function CategoryNav({ categories, selectedCategory, onSelectCategory }) {
  return (
    <nav className="category-nav">
      <h2>Categories</h2>
      <ul className="category-list">
        {categories.map((category) => (
          <li 
            key={category}
            className={category === selectedCategory ? 'active' : ''}
            onClick={() => onSelectCategory(category)}
          >
            {category}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default CategoryNav;