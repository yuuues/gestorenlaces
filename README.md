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

## Contributing Guidelines

### Code of Conduct

- Be respectful and inclusive in all interactions
- Provide constructive feedback
- Focus on what is best for the community and project
- Show empathy towards other community members

### Development Workflow

1. Fork the repository
2. Create a feature branch (see branch naming conventions below)
3. Commit your changes (following commit guidelines)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

#### Branch Naming Conventions

- Use lowercase letters and hyphens
- Use prefixes to indicate the purpose of the branch:
  - `feature/` for new features (e.g., `feature/add-dark-mode`)
  - `fix/` for bug fixes (e.g., `fix/login-error`)
  - `docs/` for documentation changes (e.g., `docs/update-api-docs`)
  - `refactor/` for code refactoring (e.g., `refactor/authentication-module`)
  - `test/` for adding or updating tests (e.g., `test/user-authentication`)
- Include a brief description of the changes after the prefix
- Use issue numbers when applicable (e.g., `feature/123-user-profile`)

### Development Standards

#### Backend (Node.js)

- Use ES6+ features where appropriate
- Organize routes in separate files
- Use async/await for asynchronous operations
- Implement proper error handling
- Document API endpoints with comments

#### Frontend (React)

- Use functional components with hooks
- Keep components small and focused on a single responsibility
- Use CSS modules or styled-components for styling
- Implement responsive design
- Follow accessibility best practices

### Code Style Guidelines

- Use consistent indentation (2 spaces)
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Follow the principle of DRY (Don't Repeat Yourself)

#### ESLint and Prettier

This project uses ESLint for code linting and Prettier for code formatting:

- ESLint enforces code quality rules and catches potential errors
- Prettier ensures consistent code formatting across the project
- Run `npm run lint` in the frontend directory to check for linting errors
- Run `npm run format` in the frontend directory to automatically format code
- Configure your editor to use ESLint and Prettier for the best development experience
- All pull requests must pass ESLint checks before being merged

### Testing Standards

This project uses Jest and React Testing Library for testing:

- Write tests for all new features and bug fixes
- Follow the Testing Library guiding principles (test behavior, not implementation)
- Test components in isolation using shallow rendering when appropriate
- Use meaningful test descriptions that explain the expected behavior
- Run tests with `npm test` in the frontend directory
- Aim for good test coverage, especially for critical functionality

### Git Commit Guidelines

Follow these guidelines for commit messages:

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests after the first line
- Consider using a conventional commit format:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `style:` for formatting changes
  - `refactor:` for code refactoring
  - `test:` for adding tests
  - `chore:` for maintenance tasks

### Pull Request Process

1. Ensure your code follows the style guidelines
2. Update documentation if necessary
3. Include tests for new features
4. Ensure all tests pass
5. Get at least one code review before merging

### Issue Reporting Guidelines

When reporting issues, please include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Screenshots if applicable
- Environment information (browser, OS, etc.)
