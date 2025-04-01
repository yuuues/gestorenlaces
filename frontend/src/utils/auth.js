// Authentication utility functions

/**
 * Check if the user is verified (has a valid module password)
 * @returns {boolean} - True if the user is verified, false otherwise
 */
export const isVerified = () => {
  const modulePassword = localStorage.getItem('moduleConfigPassword');
  return !!modulePassword;
};

/**
 * Get the module password from localStorage
 * @returns {string|null} - The module password or null if not set
 */
export const getModulePassword = () => {
  return localStorage.getItem('moduleConfigPassword');
};