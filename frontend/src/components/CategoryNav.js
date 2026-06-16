import React from 'react';
import './CategoryNav.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare, faTrash, faArrowUp, faArrowDown, faPlus } from '@fortawesome/free-solid-svg-icons';

// `categories` es ahora una lista de objetos { id, name, position }.
// `selectedCategory` sigue siendo el nombre (string). Los controles de edición
// solo aparecen en editMode.
function CategoryNav({
  categories, selectedCategory, onSelectCategory, editMode,
  onAddCategory, onEditCategory, onDeleteCategory, onMoveCategory,
}) {
  const scrollToCategory = (name) => {
    onSelectCategory(name);
    const element = document.getElementById(`category-${name}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="category-nav">
      <h2>Categories</h2>
      {editMode && (
        <button className="add-category-button" onClick={onAddCategory}>
          <FontAwesomeIcon icon={faPlus} /> Añadir categoría
        </button>
      )}
      <ul className="category-list">
        {categories.map((category, index) => (
          <li
            key={category.id}
            className={category.name === selectedCategory ? 'active' : ''}
            onClick={() => scrollToCategory(category.name)}
          >
            <span className="category-name">{category.name}</span>
            {editMode && (
              <span className="category-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-button"
                  title="Subir"
                  disabled={index === 0}
                  onClick={() => onMoveCategory(index, -1)}
                >
                  <FontAwesomeIcon icon={faArrowUp} />
                </button>
                <button
                  className="icon-button"
                  title="Bajar"
                  disabled={index === categories.length - 1}
                  onClick={() => onMoveCategory(index, 1)}
                >
                  <FontAwesomeIcon icon={faArrowDown} />
                </button>
                <button className="icon-button" title="Renombrar" onClick={() => onEditCategory(category)}>
                  <FontAwesomeIcon icon={faPenToSquare} />
                </button>
                <button className="icon-button" title="Borrar" onClick={() => onDeleteCategory(category)}>
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </span>
            )}
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
