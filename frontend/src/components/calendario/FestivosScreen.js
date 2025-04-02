import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api from '../../api';
import './CalendarioScreens.css';
import { isVerified } from '../../utils/auth';

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
    imputacion_ano: new Date().getFullYear(),
    horas: ''
  });
  const [editingId, setEditingId] = useState(null);
  const [userVerified, setUserVerified] = useState(false);

  // Check if user is verified on component mount
  useEffect(() => {
    setUserVerified(isVerified());
  }, []);

  // Fetch data on component mount
  useEffect(() => {
    fetchEmployees();
    fetchTiposFestivo();
    fetchFestivos();
  }, []);

  // Fetch employees from the API
  const fetchEmployees = async () => {
    try {
      const response = await api.get('/api/calendario/empleados');
      setEmployees(response.data);

      // Set default employee if available
      if (response.data.length > 0 && !formData.username) {
        setFormData(prev => ({
          ...prev,
          username: response.data[0].username
        }));
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError('Failed to load employees');
    }
  };

  // Fetch holiday types from the API
  const fetchTiposFestivo = async () => {
    try {
      const response = await api.get('/api/calendario/tipos');
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
      const response = await api.get('/api/calendario/festivos');
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


  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingId) {
        // Update existing holiday
        await api.put(`/api/calendario/festivos/${editingId}`, {
          fecha: formData.fecha,
          fecha_fin: formData.fecha_fin || null,
          tipo: parseInt(formData.tipo),
          pendiente: 1,
          imputacion_ano: parseInt(formData.imputacion_ano),
          horas: formData.horas ? parseFloat(formData.horas) : null
        });
      } else {
        // Create new holiday
        await api.post('/api/calendario/festivos', {
          username: formData.username,
          fecha: formData.fecha,
          fecha_fin: formData.fecha_fin || null,
          tipo: parseInt(formData.tipo),
          imputacion_ano: parseInt(formData.imputacion_ano),
          horas: formData.horas ? parseFloat(formData.horas) : null
        });
      }

      // Reset form and refresh holidays
      setFormData({
        username: employees.length > 0 ? employees[0].username : '',
        fecha: new Date().toISOString().split('T')[0],
        fecha_fin: '',
        tipo: tiposFestivo.length > 0 ? tiposFestivo[0].id : '',
        imputacion_ano: new Date().getFullYear(),
        horas: ''
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
      imputacion_ano: festivo.imputacion_ano,
      horas: festivo.horas || ''
    });
    setEditingId(festivo.id);
  };

  // Handle delete button click
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this holiday?')) {
      try {
        await api.delete(`/api/calendario/festivos/${id}`);
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
      username: employees.length > 0 ? employees[0].username : '',
      fecha: new Date().toISOString().split('T')[0],
      fecha_fin: '',
      tipo: tiposFestivo.length > 0 ? tiposFestivo[0].id : '',
      imputacion_ano: new Date().getFullYear(),
      horas: ''
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


      {userVerified ? (
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
                  {tipo.nombre} ({tipo.isHoras === 1 || tipo.isHoras === "1" ? 'Hours-Based' : 'Full Day'})
                </option>
              ))}
            </select>
          </div>

          {formData.tipo && getHolidayTypeIsHours(parseInt(formData.tipo)) && (
            <div className="form-group">
              <label htmlFor="horas">Hours:</label>
              <input
                type="number"
                id="horas"
                name="horas"
                value={formData.horas}
                onChange={handleInputChange}
                min="0"
                step="0.5"
                required
              />
              <small>Enter the number of hours</small>
            </div>
          )}

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
      ) : (
        <div className="verification-message">
          <p>You need to be verified to add or edit holidays.</p>
          <p>Please enter the module password in the navigation panel.</p>
        </div>
      )}

      <div className="table-container">
        <h3>Holidays</h3>
        {festivos.length === 0 ? (
          <p>No holidays found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Employee</th>
                <th>Date Range</th>
                <th>Holiday Type</th>
                <th>Type</th>
                <th>Hours</th>
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
                  <td>
                    {(festivo.isHoras === 1 || getHolidayTypeIsHours(festivo.tipo)) && festivo.horas ? 
                      festivo.horas : 
                      (festivo.isHoras === 1 || getHolidayTypeIsHours(festivo.tipo)) ? '-' : 'N/A'
                    }
                  </td>
                  <td>{festivo.imputacion_ano}</td>
                  <td>
                    {userVerified ? (
                      <>
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
                      </>
                    ) : (
                      <span className="action-disabled">Actions disabled</span>
                    )}
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
