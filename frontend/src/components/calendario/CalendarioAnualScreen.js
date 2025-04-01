import React, { useState, useEffect } from 'react';
import api from '../../api';
import './CalendarioScreens.css';

/**
 * Screen for managing annual calendar configuration
 */
function CalendarioAnualScreen({ onBack }) {
  const [calendarioAnual, setCalendarioAnual] = useState([]);
  const [tiposFestivo, setTiposFestivo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    tipoFestivo: '',
    cantidad: '',
    ano: new Date().getFullYear()
  });
  const [editingId, setEditingId] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Fetch calendar configuration and holiday types on component mount
  useEffect(() => {
    fetchTiposFestivo();
  }, []);

  // Fetch calendar configuration when selected year changes
  useEffect(() => {
    fetchCalendarioAnual();
  }, [selectedYear]);

  // Fetch holiday types from the API
  const fetchTiposFestivo = async () => {
    try {
      const response = await api.get('/api/calendario/tipos');
      setTiposFestivo(response.data);

      // Set default tipoFestivo if available
      if (response.data.length > 0 && !formData.tipoFestivo) {
        setFormData(prev => ({
          ...prev,
          tipoFestivo: response.data[0].id
        }));
      }
    } catch (err) {
      console.error('Error fetching holiday types:', err);
      setError('Failed to load holiday types');
    }
  };

  // Fetch calendar configuration from the API
  const fetchCalendarioAnual = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/calendario/configuracion?ano=${selectedYear}`);
      setCalendarioAnual(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching calendar configuration:', err);
      setError('Failed to load calendar configuration');
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
      ano: parseInt(e.target.value)
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate cantidad is a positive number
    if (parseInt(formData.cantidad) <= 0) {
      setError('Quantity must be a positive number');
      return;
    }

    try {
      if (editingId) {
        // Update existing calendar configuration
        await api.put(`/api/calendario/configuracion/${editingId}`, {
          tipoFestivo: parseInt(formData.tipoFestivo),
          cantidad: parseInt(formData.cantidad),
          ano: parseInt(formData.ano)
        });
      } else {
        // Create new calendar configuration
        await api.post('/api/calendario/configuracion', {
          tipoFestivo: parseInt(formData.tipoFestivo),
          cantidad: parseInt(formData.cantidad),
          ano: parseInt(formData.ano)
        });
      }

      // Reset form and refresh calendar configuration
      setFormData({
        tipoFestivo: tiposFestivo.length > 0 ? tiposFestivo[0].id : '',
        cantidad: '',
        ano: selectedYear
      });
      setEditingId(null);
      fetchCalendarioAnual();
    } catch (err) {
      console.error('Error saving calendar configuration:', err);
      setError('Failed to save calendar configuration');
    }
  };

  // Handle edit button click
  const handleEdit = (config) => {
    setFormData({
      tipoFestivo: config.tipoFestivo,
      cantidad: config.cantidad,
      ano: config.ano
    });
    setEditingId(config.id);
  };

  // Handle delete button click
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this calendar configuration?')) {
      try {
        await api.delete(`/api/calendario/configuracion/${id}`);
        fetchCalendarioAnual();
      } catch (err) {
        console.error('Error deleting calendar configuration:', err);
        setError('Failed to delete calendar configuration');
      }
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    setFormData({
      tipoFestivo: tiposFestivo.length > 0 ? tiposFestivo[0].id : '',
      cantidad: '',
      ano: selectedYear
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

  if (loading && calendarioAnual.length === 0) {
    return (
      <div className="calendario-screen">
        <h2>Annual Calendar Configuration</h2>
        <div className="loading">Loading calendar configuration...</div>
        <button className="back-button" onClick={onBack}>Back to Home</button>
      </div>
    );
  }

  return (
    <div className="calendario-screen">
      <h2>Annual Calendar Configuration</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="calendar-year-selector">
        <label htmlFor="year-selector">Select Year:</label>
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

      <form className="form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Edit Calendar Configuration' : 'Add New Calendar Configuration'}</h3>

        <div className="form-group">
          <label htmlFor="tipoFestivo">Holiday Type:</label>
          <select
            id="tipoFestivo"
            name="tipoFestivo"
            value={formData.tipoFestivo}
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

        <div className="form-group">
          <label htmlFor="cantidad">Quantity (days/hours per year):</label>
          <input
            type="number"
            id="cantidad"
            name="cantidad"
            value={formData.cantidad}
            onChange={handleInputChange}
            min="1"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="ano">Year:</label>
          <select
            id="ano"
            name="ano"
            value={formData.ano}
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
        <h3>Calendar Configuration for {selectedYear}</h3>
        {calendarioAnual.length === 0 ? (
          <p>No calendar configuration found for this year.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Holiday Type</th>
                <th>Quantity</th>
                <th>Year</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {calendarioAnual.map((config) => (
                <tr key={config.id}>
                  <td>{config.id}</td>
                  <td>
                    {config.nombre} 
                    {config.isHoras === 1 || config.isHoras === "1" ? ' (Hours-Based)' : ' (Full Day)'}
                  </td>
                  <td>{config.cantidad}</td>
                  <td>{config.ano}</td>
                  <td>
                    <button 
                      className="edit-button" 
                      onClick={() => handleEdit(config)}
                    >
                      Edit
                    </button>
                    <button 
                      className="delete-button" 
                      onClick={() => handleDelete(config.id)}
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

export default CalendarioAnualScreen;
