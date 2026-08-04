import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import IncidentTimelineCard from './IncidentTimelineCard';

let originalConsoleError;

beforeAll(() => {
  originalConsoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((message, ...args) => {
    if (
      typeof message === 'string' &&
      message.includes('ReactDOMTestUtils.act')
    ) {
      return;
    }
    originalConsoleError(message, ...args);
  });
});

afterAll(() => {
  console.error.mockRestore();
});

const resolvedIncident = {
  id: 7,
  server_id: 1,
  server_name: 'Magma',
  status: 'resolved',
  first_failed_at: '2026-08-01T04:25:57.000Z',
  last_failed_at: '2026-08-01T04:27:57.000Z',
  resolved_at: '2026-08-01T04:28:05.000Z',
  resolution_reason: 'recovered',
  consecutive_failures: 2,
  last_error: {
    kind: 'component',
    message: 'Bloqueo en BD: 1 sesión bloqueada.',
    components: ['db']
  }
};

test('resolved incident shows its diagnosis and recovery timeline', () => {
  render(
    <IncidentTimelineCard
      incident={resolvedIncident}
      serverName="Magma"
    />
  );

  expect(
    screen.getByRole('heading', { name: 'Incidencia de db' })
  ).toBeInTheDocument();
  expect(screen.getByText('Resuelta')).toBeInTheDocument();
  expect(
    screen.getByText('Bloqueo en BD: 1 sesión bloqueada.')
  ).toBeInTheDocument();
  expect(screen.getByText('Error detectado')).toBeInTheDocument();
  expect(screen.getByText('Servicio recuperado')).toBeInTheDocument();
  expect(screen.getByText(/2 fallos consecutivos/)).toBeInTheDocument();
});

test('warning closure is described without calling it a recovery', () => {
  render(
    <IncidentTimelineCard
      incident={{ ...resolvedIncident, resolution_reason: 'warning' }}
      serverName="Magma"
    />
  );

  expect(screen.getByText('El error pasó a aviso')).toBeInTheDocument();
  expect(screen.queryByText('Servicio recuperado')).not.toBeInTheDocument();
});

test('open network incident uses the server name and stays in progress', () => {
  render(
    <IncidentTimelineCard
      incident={{
        ...resolvedIncident,
        status: 'open',
        resolved_at: null,
        resolution_reason: null,
        last_error: {
          kind: 'network',
          message: 'connect ECONNREFUSED',
          components: []
        }
      }}
      serverName="Magma"
    />
  );

  expect(
    screen.getByRole('heading', { name: 'Incidencia de Magma' })
  ).toBeInTheDocument();
  expect(screen.getByText('Abierta')).toBeInTheDocument();
  expect(screen.getByText('En curso')).toBeInTheDocument();
});
