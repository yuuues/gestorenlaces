import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './EmployeeStatus.css';

/**
 * Component to display employee status on the main page
 * 
 * Displays a colored box for each employee:
 * - Green: Employee is working today
 * - Gray: Employee is not working today (has a holiday)
 * - Orange: Employee is partially working today (has hours-based holiday)
 */
function EmployeeStatus() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch employee status on component mount
  useEffect(() => {
    const fetchEmployeeStatus = async () => {
      try {
        const response = await axios.get('/api/calendario/status');
        setEmployees(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching employee status:', err);
        setError('Failed to load employee status');
        setLoading(false);
      }
    };

    fetchEmployeeStatus();
  }, []);

  if (loading) {
    return <div className="employee-status-loading">Loading employee status...</div>;
  }

  if (error) {
    return <div className="employee-status-error">{error}</div>;
  }

  if (employees.length === 0) {
    return null; // Don't show anything if there are no employees
  }

  return (
    <div className="employee-status-container">
      <h3 className="employee-status-title">Employee Status</h3>
      <div className="employee-status-grid">
        {employees.map((employee) => (
          <div
            key={employee.username}
            className={`employee-status-box employee-status-${employee.status}`}
            title={`${employee.username} - ${getStatusText(employee.status)}`}
          >
            {employee.username.substring(0, 2).toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Get the text description of an employee status
 * @param {string} status - The employee status (working, off, partial)
 * @returns {string} - The text description of the status
 */
function getStatusText(status) {
  switch (status) {
    case 'working':
      return 'Working today';
    case 'off':
      return 'Not working today';
    case 'partial':
      return 'Partially working today';
    default:
      return 'Unknown status';
  }
}

export default EmployeeStatus;