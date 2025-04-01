import React, { useState, useEffect } from 'react';
import api from '../../api';
import './CalendarioScreens.css';

/**
 * Screen for managing holiday types
 */
function TipoFestivoScreen({ onBack }) {
  const [tiposFestivo, setTiposFestivo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '',
    isHoras: false
  });
  const [editingId, setEditingId] = useState(null);

  // Fetch holiday types on component mount
  useEffect(() => {
    fetchTiposFestivo();
  }, []);

  // Fetch holiday types from the API
  const fetchTiposFestivo = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/calendario/tipos');
      setTiposFestivo(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching holiday types:', err);
      setError('Failed to load holiday types');
      setLoading(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingId) {
        // Update existing holiday type
        await api.put(`/api/calendario/tipos/${editingId}`, formData);
      } else {
        // Create new holiday type
        await api.post('/api/calendario/tipos', formData);
      }

      // Reset form and refresh holiday types
      setFormData({
        nombre: '',
        isHoras: false
      });
      setEditingId(null);
      fetchTiposFestivo();
    } catch (err) {
      console.error('Error saving holiday type:', err);
      setError('Failed to save holiday type');
    }
  };

  // Handle edit button click
  const handleEdit = (tipoFestivo) => {
    setFormData({
      nombre: tipoFestivo.nombre,
      isHoras: tipoFestivo.isHoras === 1 || tipoFestivo.isHoras === "1"
    });
    setEditingId(tipoFestivo.id);
  };

  // Handle delete button click
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this holiday type?')) {
      try {
        await api.delete(`/api/calendario/tipos/${id}`);
        fetchTiposFestivo();
      } catch (err) {
        console.error('Error deleting holiday type:', err);
        setError('Failed to delete holiday type');
      }
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    setFormData({
      nombre: '',
      isHoras: false
    });
    setEditingId(null);
  };

  if (loading && tiposFestivo.length === 0) {
    return (
      <div className="calendario-screen">
        <h2>Holiday Types Management</h2>
        <div className="loading">Loading holiday types...</div>
        <button className="back-button" onClick={onBack}>Back to Home</button>
      </div>
    );
  }

  return (
    <div className="calendario-screen">
      <h2>Holiday Types Management</h2>

      {error && <div className="error-message">{error}</div>}

      <form className="form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Edit Holiday Type' : 'Add New Holiday Type'}</h3>

        <div className="form-group">
          <label htmlFor="nombre">Name:</label>
          <input
            type="text"
            id="nombre"
            name="nombre"
            value={formData.nombre}
            onChange={handleInputChange}
            required
          />
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              name="isHoras"
              checked={formData.isHoras}
              onChange={handleInputChange}
            />
            Is Hours-Based (partial day off)
          </label>
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
        <h3>Holiday Types</h3>
        {tiposFestivo.length === 0 ? (
          <p>No holiday types found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tiposFestivo.map((tipo) => (
                <tr key={tipo.id}>
                  <td>{tipo.id}</td>
                  <td>{tipo.nombre}</td>
                  <td>
                    {tipo.isHoras === 1 || tipo.isHoras === "1" ? (
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
                    <button 
                      className="edit-button" 
                      onClick={() => handleEdit(tipo)}
                    >
                      Edit
                    </button>
                    <button 
                      className="delete-button" 
                      onClick={() => handleDelete(tipo.id)}
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

export default TipoFestivoScreen;
