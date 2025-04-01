import React, { useMemo } from 'react';
import './BookmarkList.css';

function BookmarkList({ bookmarks, selectedCategory, searchQuery }) {
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

  // Get categories from grouped bookmarks
  const categories = Object.keys(bookmarksByCategory).sort();

  if (bookmarks.length === 0) {
    return searchQuery ? 
      <div className="no-bookmarks">No results found for "{searchQuery}"</div> :
      <div className="no-bookmarks">No bookmarks found</div>;
  }

  return (
    <div className="bookmark-list">
      {categories.map(categoryName => (
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
