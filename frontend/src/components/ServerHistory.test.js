import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ServerHistory from './ServerHistory';
import {
  getHealthStatus,
  getServerIncidents,
  getServers
} from '../api';

jest.mock('../api', () => ({
  getHealthStatus: jest.fn(),
  getServerIncidents: jest.fn(),
  getServers: jest.fn()
}));

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
  id: 7,
  server_id: 1,
  server_name: 'Magma',
  component_key: 'db',
  highest_severity: 'warning',
  status: 'resolved',
  first_observed_at: '2026-08-01T04:25:57.000Z',
  last_observed_at: '2026-08-01T04:27:57.000Z',
  resolved_at: '2026-08-01T04:28:05.000Z',
  resolution_reason: 'recovered',
  observation_count: 2,
  events: [{
    id: 70,
    type: 'detected',
    severity: 'warning',
    observed_at: '2026-08-01T04:25:57.000Z',
    messages: ['Aviso en BD']
  }]
};

const errorEpisode = {
  id: 8,
  server_id: 1,
  server_name: 'Magma',
  component_key: 'db2',
  highest_severity: 'error',
  status: 'resolved',
  first_observed_at: '2026-08-01T05:25:57.000Z',
  last_observed_at: '2026-08-01T05:27:57.000Z',
  resolved_at: '2026-08-01T05:28:05.000Z',
  resolution_reason: 'recovered',
  observation_count: 2,
  events: [{
    id: 80,
    type: 'detected',
    severity: 'error',
    observed_at: '2026-08-01T05:25:57.000Z',
    messages: ['Error en BD secundaria']
  }]
};

const prepareApi = ({ items = [warningEpisode, errorEpisode], total = 2 } = {}) => {
  getServers.mockResolvedValue({
    data: [
      {
        id: 1,
        name: 'Magma',
        url: 'https://magma.example/health',
        description: 'Principal'
      }
    ]
  });
  getHealthStatus.mockResolvedValue({
    data: {
      servers: {
        Magma: {
          serverId: 1,
          name: 'Magma',
          status: 'warning'
        }
      }
    }
  });
  getServerIncidents.mockResolvedValue({
    data: { items, total, limit: 20, offset: 0 }
  });
};

const renderHistory = () =>
  render(
    <MemoryRouter
      initialEntries={['/health/servers/1/history']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/health/servers/:serverId/history"
          element={<ServerHistory />}
        />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  jest.clearAllMocks();
});

test('shows warning and error episodes in the server history', async () => {
  prepareApi();

  renderHistory();

  expect(
    await screen.findByRole('heading', { name: 'Magma · Histórico' })
  ).toBeInTheDocument();
  expect(screen.getByText('Estado actual: Aviso')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Aviso de db' })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Incidencia de db2' })
  ).toBeInTheDocument();
  expect(screen.getByText('2 registros históricos')).toBeInTheDocument();
});

test('applies filters and resets pagination to the first page', async () => {
  prepareApi();
  renderHistory();
  await screen.findByRole('heading', { name: 'Magma · Histórico' });

  fireEvent.change(screen.getByLabelText('Estado'), {
    target: { value: 'resolved' }
  });
  fireEvent.change(screen.getByLabelText('Periodo'), {
    target: { value: '30' }
  });
  fireEvent.change(screen.getByLabelText('Componente'), {
    target: { value: 'db' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

  await waitFor(() =>
    expect(getServerIncidents).toHaveBeenLastCalledWith(1, {
      limit: 20,
      offset: 0,
      status: 'resolved',
      days: 30,
      component: 'db'
    })
  );
});

test('loads the next page of server incidents', async () => {
  prepareApi({ total: 21 });
  renderHistory();
  await screen.findByRole('heading', { name: 'Magma · Histórico' });

  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

  await waitFor(() =>
    expect(getServerIncidents).toHaveBeenLastCalledWith(1, {
      limit: 20,
      offset: 20,
      status: '',
      days: '',
      component: ''
    })
  );
});

test('explains when the server has no warnings or incidents', async () => {
  prepareApi({ items: [], total: 0 });

  renderHistory();

  expect(
    await screen.findByText(
      'Este servidor todavía no tiene avisos ni incidencias registrados.'
    )
  ).toBeInTheDocument();
});

test('shows a useful error when history cannot be loaded', async () => {
  prepareApi();
  getServerIncidents.mockRejectedValueOnce(new Error('network down'));

  renderHistory();

  expect(
    await screen.findByText('No se pudo cargar el histórico del servidor.')
  ).toBeInTheDocument();
});
