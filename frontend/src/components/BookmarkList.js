import React, { useMemo } from 'react';
import './BookmarkList.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';

// Add all icons to the library
library.add(fas, fab);

function BookmarkList({ bookmarks, selectedCategory, searchQuery, categories }) {
  // Group bookmarks by category
  const bookmarksByCategory = useMemo(() => {
    const grouped = {};

    bookmarks.forEach(bookmark => {
      if (!grouped[bookmark.category]) {
        grouped[bookmark.category] = [];
      }
      grouped[bookmark.category].push(bookmark);
    });

    return grouped;
  }, [bookmarks]);

  // Filter the categories to only include those that have bookmarks
  const displayCategories = categories.filter(category => bookmarksByCategory[category]);

  if (bookmarks.length === 0) {
    return searchQuery ? 
      <div className="no-bookmarks">No results found for "{searchQuery}"</div> :
      <div className="no-bookmarks">No bookmarks found</div>;
  }

  return (
    <div className="bookmark-list">
      {displayCategories.map(categoryName => (
        <div key={categoryName} id={`category-${categoryName}`} className="category-section">
          <h2>{categoryName}</h2>
          <div className="bookmarks">
            {bookmarksByCategory[categoryName].map((bookmark) => (
              <div key={bookmark.id} className="bookmark-card">
                <h3 className="bookmark-title">{bookmark.short_description}</h3>
                {bookmark.long_description && (
                  <p className="bookmark-description">{bookmark.long_description}</p>
                )}
                <a 
                  href={bookmark.link} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="bookmark-link"
                >
                  {bookmark.icon && (
                    <FontAwesomeIcon 
                      icon={bookmark.icon.includes('-') ? bookmark.icon : ['fas', bookmark.icon]} 
                      className="bookmark-icon" 
                      style={{ marginRight: '8px' }}
                    />
                  )}
                  Visit Site
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default BookmarkList;
