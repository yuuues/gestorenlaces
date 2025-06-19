# Bookmarks Manager

A web application for managing bookmarks, organized by categories. This project consists of a Node.js backend and a React frontend.

## Features

- View bookmarks organized by categories
- Categories are always accessible via a fixed sidebar
- Store bookmarks in a SQLite database
- Import bookmarks from JSON file on first run
- Export bookmarks to JSON file
- Backend builds and serves the frontend

## Project Structure

```
GestorEnlaces/
├── backend/
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── package.json
│   ├── public/
│   │   ├── index.html
│   │   └── manifest.json
│   └── src/
│       ├── App.js
│       ├── App.css
│       ├── index.js
│       ├── index.css
│       └── components/
│           ├── CategoryNav.js
│           ├── CategoryNav.css
│           ├── BookmarkList.js
│           └── BookmarkList.css
└── json/
    └── bookmarks.json
```

## Setup and Installation

### Option 1: Running Backend and Frontend Separately (Development)

#### Backend

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the Node.js application in development mode:
   ```
   npm run dev
   ```

   The backend will run on http://localhost:5000

#### Frontend

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the React application:
   ```
   npm start
   ```

   The frontend will run on http://localhost:3000

### Option 2: Running Everything from Backend (Production)

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the frontend:
   ```
   npm run build
   ```

4. Start the server:
   ```
   npm start
   ```

   The application will be available at http://localhost:5000

## API Endpoints

- `GET /api/bookmarks`: Get all bookmarks
- `GET /api/bookmarks/category/<category>`: Get bookmarks by category
- `GET /api/categories`: Get all categories
- `POST /api/bookmarks`: Create a new bookmark
- `PUT /api/bookmarks/<id>`: Update a bookmark
- `DELETE /api/bookmarks/<id>`: Delete a bookmark
- `GET /api/export`: Export bookmarks to JSON

## Data Model

Each bookmark has the following fields:
- `category`: The category of the bookmark
- `short_description`: A short title or description
- `long_description`: A longer description (optional)
- `link`: The URL of the bookmark

## Initial Data

The application comes with sample bookmarks in the `json/bookmarks.json` file. These will be imported into the database on first run if the database doesn't exist.

