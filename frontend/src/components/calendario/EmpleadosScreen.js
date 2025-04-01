import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CalendarioScreens.css';

/**
 * Screen for managing employees
 */
function EmpleadosScreen({ onBack }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    fecha_inicio: '',
    fecha_fin: ''
  });
  const [editingId, setEditingId] = useState(null);

  // Fetch employees on component mount
  useEffect(() => {
    fetchEmployees();
  }, []);

  // Fetch employees from the API
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/calendario/empleados');
      setEmployees(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError('Failed to load employees');
      setLoading(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        // Update existing employee
        await axios.put(`/api/calendario/empleados/${editingId}`, formData);
      } else {
        // Create new employee
        await axios.post('/api/calendario/empleados', formData);
      }
      
      // Reset form and refresh employees
      setFormData({
        username: '',
        fecha_inicio: '',
        fecha_fin: ''
      });
      setEditingId(null);
      fetchEmployees();
    } catch (err) {
      console.error('Error saving employee:', err);
      setError('Failed to save employee');
    }
  };

  // Handle edit button click
  const handleEdit = (employee) => {
    setFormData({
      username: employee.username,
      fecha_inicio: employee.fecha_inicio,
      fecha_fin: employee.fecha_fin || ''
    });
    setEditingId(employee.username);
  };

  // Handle delete button click
  const handleDelete = async (username) => {
    if (window.confirm(`Are you sure you want to delete employee ${username}?`)) {
      try {
        await axios.delete(`/api/calendario/empleados/${username}`);
        fetchEmployees();
      } catch (err) {
        console.error('Error deleting employee:', err);
        setError('Failed to delete employee');
      }
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    setFormData({
      username: '',
      fecha_inicio: '',
      fecha_fin: ''
    });
    setEditingId(null);
  };

  if (loading && employees.length === 0) {
    return (
      <div className="calendario-screen">
        <h2>Employee Management</h2>
        <div className="loading">Loading employees...</div>
        <button className="back-button" onClick={onBack}>Back to Home</button>
      </div>
    );
  }

  return (
    <div className="calendario-screen">
      <h2>Employee Management</h2>
      
      {error && <div className="error-message">{error}</div>}
      
      <form className="form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Edit Employee' : 'Add New Employee'}</h3>
        
        <div className="form-group">
          <label htmlFor="username">Username:</label>
          <input
            type="text"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            required
            disabled={editingId}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="fecha_inicio">Start Date:</label>
          <input
            type="date"
            id="fecha_inicio"
            name="fecha_inicio"
            value={formData.fecha_inicio}
            onChange={handleInputChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="fecha_fin">End Date (optional):</label>
          <input
            type="date"
            id="fecha_fin"
            name="fecha_fin"
            value={formData.fecha_fin}
            onChange={handleInputChange}
          />
        </div>
        
        <div className="form-buttons">
          <button type="submit" className="submit-button">
            {editingId ? 'Update' : 'Add'}
          </button>
          {editingId && (
            <button type="button" className="cancel-button" onClick={handleCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
      
      <div className="table-container">
        <h3>Employees</h3>
        {employees.length === 0 ? (
          <p>No employees found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.username}>
                  <td>{employee.username}</td>
                  <td>{new Date(employee.fecha_inicio).toLocaleDateString()}</td>
                  <td>
                    {employee.fecha_fin 
                      ? new Date(employee.fecha_fin).toLocaleDateString() 
                      : 'N/A'}
                  </td>
                  <td>
                    <button 
                      className="edit-button" 
                      onClick={() => handleEdit(employee)}
                    >
                      Edit
                    </button>
                    <button 
                      className="delete-button" 
                      onClick={() => handleDelete(employee.username)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      <button className="back-button" onClick={onBack}>Back to Home</button>
    </div>
  );
}

export default EmpleadosScreen;