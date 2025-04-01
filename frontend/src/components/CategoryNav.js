import React from 'react';
import './CategoryNav.css';

function CategoryNav({ categories, selectedCategory, onSelectCategory }) {
  const scrollToCategory = (category) => {
    // Update the selected category in the parent component
    onSelectCategory(category);

    // Scroll to the category section
    const element = document.getElementById(`category-${category}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="category-nav">
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
