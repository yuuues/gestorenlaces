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
      config.url.includes('/api/calendario/tipos') || 
      config.url.includes('/api/calendario/configuracion') ||
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

export default api;