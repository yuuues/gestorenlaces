import axios from 'axios';

// Create an axios instance
const api = axios.create();

// Attach the admin key (if the user has unlocked edit mode) to every request.
// Read routes ignore it; write routes require it server-side.
api.interceptors.request.use((config) => {
  const key = sessionStorage.getItem('adminKey');
  if (key) {
    config.headers['x-admin-key'] = key;
  }
  return config;
});

// Validate a key against the backend without storing it. Passes the key
// explicitly because it is not yet in sessionStorage at unlock time.
export const verifyKey = (key) =>
  api.post('/api/auth/verify', null, { headers: { 'x-admin-key': key } });

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

// MCP API functions
export const getMcps = () => api.get('/api/mcps');
export const getMcpReadme = (folder) => api.get(`/api/mcps/${folder}/readme`);
export const getMcpFiles = (folder) => api.get(`/api/mcps/${folder}/files`);
export const getMcpFileUrl = (folder, filename) =>
  `/api/mcps/${encodeURIComponent(folder)}/file/${encodeURIComponent(filename)}`;

export default api;
