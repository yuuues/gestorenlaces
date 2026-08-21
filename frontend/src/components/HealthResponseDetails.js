import React, { useState } from 'react';
import './HealthResponseDetails.css';

const HealthResponseDetails = ({ server }) => {
  const [open, setOpen] = useState(false);
  const label = `respuesta completa de ${server.name}`;

  if (server.responseBody === undefined) return null;

  return (
    <section className="health-response-details">
      <button
        type="button"
        className="health-response-toggle"
        aria-expanded={open}
        aria-label={`${open ? 'Ocultar' : 'Ver'} ${label}`}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? 'Ocultar respuesta completa' : 'Ver respuesta completa'}
      </button>
      {open && (
        <pre aria-label={`Respuesta completa de ${server.name}`}>
          {JSON.stringify(server.responseBody, null, 2)}
        </pre>
      )}
    </section>
  );
};

export default HealthResponseDetails;
