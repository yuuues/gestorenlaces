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

const warningEpisode = {
  id: 9,
  component_name: 'db',
  status: 'resolved',
  current_severity: 'warning',
  highest_severity: 'warning',
  first_observed_at: '2026-08-04T15:06:29.000Z',
  resolved_at: '2026-08-04T15:10:11.000Z',
  observation_count: 4,
  events: [
    {
      type: 'detected',
      severity: 'warning',
      observed_at: '2026-08-04T15:06:29.000Z',
      messages: ['Espera de 30s']
    },
    {
      type: 'update',
      severity: 'warning',
      observed_at: '2026-08-04T15:07:29.000Z',
      messages: ['Espera de 45s']
    },
    {
      type: 'recovered',
      severity: 'ok',
      observed_at: '2026-08-04T15:10:11.000Z',
      messages: []
    }
  ]
};

const errorEpisode = {
  id: 10,
  component_name: 'api',
  status: 'open',
  current_severity: 'error',
  highest_severity: 'error',
  first_observed_at: '2026-08-04T15:06:29.000Z',
  last_observed_at: '2026-08-04T15:07:29.000Z',
  observation_count: 2,
  events: [
    {
      type: 'detected',
      severity: 'error',
      observed_at: '2026-08-04T15:06:29.000Z',
      messages: ['Tiempo de espera agotado', 'Conexión rechazada']
    },
    {
      type: 'update',
      severity: 'error',
      observed_at: '2026-08-04T15:07:29.000Z',
      messages: ['Nuevo tiempo de espera']
    }
  ]
};

const errorToWarningEpisode = {
  ...errorEpisode,
  current_severity: 'warning',
  events: [
    errorEpisode.events[0],
    {
      type: 'update',
      severity: 'warning',
      observed_at: '2026-08-04T15:07:29.000Z',
      messages: ['Latencia elevada']
    }
  ]
};

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

test('diagnostic warning episode renders every event without the legacy banner', () => {
  render(
    <IncidentTimelineCard
      incident={warningEpisode}
      serverName="Magma"
    />
  );

  expect(
    screen.getByRole('heading', { name: 'Aviso de db' })
  ).toBeInTheDocument();
  expect(screen.getByText('Resuelta')).toBeInTheDocument();
  expect(screen.getByText('Aviso detectado')).toBeInTheDocument();
  expect(screen.getByText('Actualización · Aviso')).toBeInTheDocument();
  expect(screen.getByText('Servicio recuperado')).toBeInTheDocument();
  expect(screen.getByText('Espera de 30s')).toBeInTheDocument();
  expect(screen.getByText('Espera de 45s')).toBeInTheDocument();
  expect(screen.queryByText('Components failed')).not.toBeInTheDocument();
});

test('diagnostic error event groups all of its messages in one timeline item', () => {
  render(
    <IncidentTimelineCard
      incident={errorEpisode}
      serverName="Magma"
    />
  );

  const event = screen.getByText('Error detectado').closest('li');
  expect(event).toContainElement(screen.getByText('Tiempo de espera agotado'));
  expect(event).toContainElement(screen.getByText('Conexión rechazada'));
  expect(screen.getByText('Error activo')).toBeInTheDocument();
  expect(screen.getByText('Actualización · Error')).toBeInTheDocument();
});

test('open error history exposes a current warning without changing its peak title', () => {
  render(
    <IncidentTimelineCard
      incident={errorToWarningEpisode}
      serverName="Magma"
    />
  );

  expect(
    screen.getByRole('heading', { name: 'Incidencia de api' })
  ).toBeInTheDocument();
  expect(screen.getByText('Aviso activo')).toBeInTheDocument();
  expect(screen.getByText('Actualización · Aviso')).toBeInTheDocument();
});

test('legacy incident keeps its diagnosis and recovery timeline', () => {
  render(
    <IncidentTimelineCard
      incident={resolvedIncident}
      serverName="Magma"
    />
  );

  expect(
    screen.getByRole('heading', { name: 'Incidencia de db' })
  ).toBeInTheDocument();
  expect(
    screen.getByText('Bloqueo en BD: 1 sesión bloqueada.')
  ).toBeInTheDocument();
  expect(screen.getByText('Servicio recuperado')).toBeInTheDocument();
  expect(screen.getByText(/2 fallos consecutivos/)).toBeInTheDocument();
});

test.each([
  {
    reason: 'recovered',
    event: { type: 'recovered', severity: 'ok' },
    label: 'Servicio recuperado',
    marker: 'recovered'
  },
  {
    reason: 'warning',
    event: { type: 'warning', severity: 'warning' },
    label: 'Pasó a aviso',
    marker: 'warning'
  },
  {
    reason: 'monitor_removed',
    event: { type: 'monitor_removed', severity: 'neutral' },
    label: 'Monitor eliminado',
    marker: 'neutral'
  }
])('renders a truthful $reason migration closure', ({
  reason,
  event,
  label,
  marker
}) => {
  render(
    <IncidentTimelineCard
      serverName="Magma"
      incident={{
        ...warningEpisode,
        id: `legacy-${reason}`,
        resolution_reason: reason,
        events: [
          warningEpisode.events[0],
          {
            ...event,
            observed_at: '2026-08-04T15:10:11.000Z',
            messages: []
          }
        ]
      }}
    />
  );

  const closure = screen.getByText(label).closest('li');
  expect(closure).toHaveClass(marker);
  if (reason !== 'recovered') {
    expect(screen.queryByText('Servicio recuperado')).not.toBeInTheDocument();
    expect(closure).not.toHaveClass('recovered');
  }
});

test('legacy monitor removal is not presented as a green recovery', () => {
  render(
    <IncidentTimelineCard
      incident={{
        ...resolvedIncident,
        resolution_reason: 'monitor_removed'
      }}
      serverName="Magma"
    />
  );

  const closure = screen.getByText('Monitor eliminado').closest('li');
  expect(closure).toHaveClass('neutral');
  expect(screen.queryByText('Servicio recuperado')).not.toBeInTheDocument();
});
