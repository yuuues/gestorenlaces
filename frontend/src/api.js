import axios from 'axios';

// Create an axios instance
const api = axios.create();

// Add a request interceptor to include the module configuration password in headers
api.interceptors.request.use(
  (config) => {
    // Get the password from localStorage
    const moduleConfigPassword = localStorage.getItem('moduleConfigPassword');

    // Check if the request is to a protected route
    const isProtectedRoute = 
      config.url.includes('/api/modules/config');

    // Add the password to the headers if it exists and the route is protected
    if (moduleConfigPassword && isProtectedRoute) {
      config.headers['module-config-password'] = moduleConfigPassword;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Bookmarks API functions
export const getBookmarks = () => api.get('/api/bookmarks');
export const getBookmarksByCategory = (category) => api.get(`/api/bookmarks/category/${category}`);
export const getCategories = () => api.get('/api/categories');
export const createBookmark = (bookmark) => api.post('/api/bookmarks', bookmark);
export const updateBookmark = (id, bookmark) => api.put(`/api/bookmarks/${id}`, bookmark);
export const deleteBookmark = (id) => api.delete(`/api/bookmarks/${id}`);

// Server Health API functions
export const getServers = () => api.get('/api/health/servers');
export const checkServersHealth = () => api.get('/api/health/check');
export const createServer = (server) => api.post('/api/health/servers', server);
export const updateServer = (id, server) => api.put(`/api/health/servers/${id}`, server);
export const deleteServer = (id) => api.delete(`/api/health/servers/${id}`);

export default api;
