import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CalendarioScreens.css';

/**
 * Screen for managing employee holidays
 */
function FestivosScreen({ onBack }) {
  const [festivos, setFestivos] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [tiposFestivo, setTiposFestivo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    fecha: new Date().toISOString().split('T')[0],
    fecha_fin: '',
    tipo: '',
    imputacion_ano: new Date().getFullYear()
  });
  const [editingId, setEditingId] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // Fetch data on component mount
  useEffect(() => {
    fetchEmployees();
    fetchTiposFestivo();
  }, []);

  // Fetch festivos when filters change
  useEffect(() => {
    fetchFestivos();
  }, [selectedYear, selectedEmployee]);

  // Fetch employees from the API
  const fetchEmployees = async () => {
    try {
      const response = await axios.get('/api/calendario/empleados');
      setEmployees(response.data);

      // Set default employee if available
      if (response.data.length > 0 && !formData.username) {
        setFormData(prev => ({
          ...prev,
          username: response.data[0].username
        }));
        setSelectedEmployee(response.data[0].username);
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError('Failed to load employees');
    }
  };

  // Fetch holiday types from the API
  const fetchTiposFestivo = async () => {
    try {
      const response = await axios.get('/api/calendario/tipos', {
        headers: {
          'module-config-password': 'GAS'
        }
      });
      setTiposFestivo(response.data);

      // Set default tipo if available
      if (response.data.length > 0 && !formData.tipo) {
        setFormData(prev => ({
          ...prev,
          tipo: response.data[0].id
        }));
      }
    } catch (err) {
      console.error('Error fetching holiday types:', err);
      setError('Failed to load holiday types');
    }
  };

  // Fetch festivos from the API
  const fetchFestivos = async () => {
    setLoading(true);
    try {
      let url = `/api/calendario/festivos?ano=${selectedYear}`;
      if (selectedEmployee) {
        url += `&username=${selectedEmployee}`;
      }

      const response = await axios.get(url);
      setFestivos(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching holidays:', err);
      setError('Failed to load holidays');
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

  // Handle year selector change
  const handleYearChange = (e) => {
    setSelectedYear(parseInt(e.target.value));
    setFormData(prev => ({
      ...prev,
      imputacion_ano: parseInt(e.target.value)
    }));
  };

  // Handle employee selector change
  const handleEmployeeChange = (e) => {
    setSelectedEmployee(e.target.value);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingId) {
        // Update existing holiday
        await axios.put(`/api/calendario/festivos/${editingId}`, {
          fecha: formData.fecha,
          fecha_fin: formData.fecha_fin || null,
          tipo: parseInt(formData.tipo),
          pendiente: 1,
          imputacion_ano: parseInt(formData.imputacion_ano)
        });
      } else {
        // Create new holiday
        await axios.post('/api/calendario/festivos', {
          username: formData.username,
          fecha: formData.fecha,
          fecha_fin: formData.fecha_fin || null,
          tipo: parseInt(formData.tipo),
          imputacion_ano: parseInt(formData.imputacion_ano)
        });
      }

      // Reset form and refresh holidays
      setFormData({
        username: selectedEmployee,
        fecha: new Date().toISOString().split('T')[0],
        fecha_fin: '',
        tipo: tiposFestivo.length > 0 ? tiposFestivo[0].id : '',
        imputacion_ano: selectedYear
      });
      setEditingId(null);
      fetchFestivos();
    } catch (err) {
      console.error('Error saving holiday:', err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError('Failed to save holiday');
      }
    }
  };

  // Handle edit button click
  const handleEdit = (festivo) => {
    setFormData({
      username: festivo.username,
      fecha: festivo.fecha,
      fecha_fin: festivo.fecha_fin || '',
      tipo: festivo.tipo,
      imputacion_ano: festivo.imputacion_ano
    });
    setEditingId(festivo.id);
  };

  // Handle delete button click
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this holiday?')) {
      try {
        await axios.delete(`/api/calendario/festivos/${id}`);
        fetchFestivos();
      } catch (err) {
        console.error('Error deleting holiday:', err);
        setError('Failed to delete holiday');
      }
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    setFormData({
      username: selectedEmployee,
      fecha: new Date().toISOString().split('T')[0],
      fecha_fin: '',
      tipo: tiposFestivo.length > 0 ? tiposFestivo[0].id : '',
      imputacion_ano: selectedYear
    });
    setEditingId(null);
  };

  // Generate year options for the selector
  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 2; i <= currentYear + 2; i++) {
      years.push(i);
    }
    return years;
  };

  // Get holiday type name by ID
  const getHolidayTypeName = (id) => {
    const tipo = tiposFestivo.find(t => t.id === id);
    return tipo ? tipo.nombre : 'Unknown';
  };

  // Get holiday type is hours by ID
  const getHolidayTypeIsHours = (id) => {
    const tipo = tiposFestivo.find(t => t.id === id);
    return tipo ? tipo.isHoras === 1 : false;
  };

  if (loading && festivos.length === 0) {
    return (
      <div className="calendario-screen">
        <h2>Employee Holidays Management</h2>
        <div className="loading">Loading holidays...</div>
        <button className="back-button" onClick={onBack}>Back to Home</button>
      </div>
    );
  }

  return (
    <div className="calendario-screen">
      <h2>Employee Holidays Management</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="filters-container">
        <div className="filter-group">
          <label htmlFor="employee-selector">Employee:</label>
          <select 
            id="employee-selector" 
            value={selectedEmployee}
            onChange={handleEmployeeChange}
          >
            <option value="">All Employees</option>
            {employees.map(employee => (
              <option key={employee.username} value={employee.username}>
                {employee.username}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="year-selector">Year:</label>
          <select 
            id="year-selector" 
            value={selectedYear}
            onChange={handleYearChange}
          >
            {generateYearOptions().map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Edit Holiday' : 'Add New Holiday'}</h3>

        <div className="form-group">
          <label htmlFor="username">Employee:</label>
          <select
            id="username"
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            required
            disabled={editingId}
          >
            <option value="">Select an employee</option>
            {employees.map(employee => (
              <option key={employee.username} value={employee.username}>
                {employee.username}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="fecha">Start Date:</label>
          <input
            type="date"
            id="fecha"
            name="fecha"
            value={formData.fecha}
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
            min={formData.fecha}
          />
          <small>Leave empty for single day</small>
        </div>

        <div className="form-group">
          <label htmlFor="tipo">Holiday Type:</label>
          <select
            id="tipo"
            name="tipo"
            value={formData.tipo}
            onChange={handleInputChange}
            required
          >
            <option value="">Select a holiday type</option>
            {tiposFestivo.map(tipo => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre} ({tipo.isHoras ? 'Hours-Based' : 'Full Day'})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="imputacion_ano">Year:</label>
          <select
            id="imputacion_ano"
            name="imputacion_ano"
            value={formData.imputacion_ano}
            onChange={handleInputChange}
            required
          >
            {generateYearOptions().map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
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
        <h3>Holidays {selectedEmployee ? `for ${selectedEmployee}` : ''} in {selectedYear}</h3>
        {festivos.length === 0 ? (
          <p>No holidays found for the selected filters.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Employee</th>
                <th>Date Range</th>
                <th>Holiday Type</th>
                <th>Type</th>
                <th>Year</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {festivos.map((festivo) => (
                <tr key={festivo.id}>
                  <td>{festivo.id}</td>
                  <td>{festivo.empleado_nombre || festivo.username}</td>
                  <td>
                    {new Date(festivo.fecha).toLocaleDateString()}
                    {festivo.fecha_fin && (
                      <> - {new Date(festivo.fecha_fin).toLocaleDateString()}</>
                    )}
                  </td>
                  <td>{festivo.tipo_nombre || getHolidayTypeName(festivo.tipo)}</td>
                  <td>
                    {festivo.isHoras === 1 || getHolidayTypeIsHours(festivo.tipo) ? (
                      <span>
                        <span className="status-indicator partial"></span>
                        Hours-Based
                      </span>
                    ) : (
                      <span>
                        <span className="status-indicator off"></span>
                        Full Day
                      </span>
                    )}
                  </td>
                  <td>{festivo.imputacion_ano}</td>
                  <td>
                    <button 
                      className="edit-button" 
                      onClick={() => handleEdit(festivo)}
                    >
                      Edit
                    </button>
                    <button 
                      className="delete-button" 
                      onClick={() => handleDelete(festivo.id)}
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

export default FestivosScreen;
