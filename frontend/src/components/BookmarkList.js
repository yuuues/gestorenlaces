import React from 'react';
import './BookmarkList.css';

function BookmarkList({ bookmarks, category, searchQuery }) {
  if (!category) {
    return <div className="no-category">Please select a category</div>;
  }

  if (bookmarks.length === 0) {
    return searchQuery ? 
      <div className="no-bookmarks">No results found for "{searchQuery}"</div> :
      <div className="no-bookmarks">No bookmarks found in this category</div>;
  }

  return (
    <div className="bookmark-list">
      <h2>{category}</h2>
      <div className="bookmarks">
        {bookmarks.map((bookmark) => (
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
  );
}

export default BookmarkList;
