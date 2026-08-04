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

const incident = {
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
    message: 'Bloqueo en BD',
    components: ['db']
  }
};

const prepareApi = ({ items = [incident], total = 21 } = {}) => {
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

test('shows the server state and one timeline card per incident', async () => {
  prepareApi();

  renderHistory();

  expect(
    await screen.findByRole('heading', { name: 'Magma · Histórico' })
  ).toBeInTheDocument();
  expect(screen.getByText('Estado actual: Aviso')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Incidencia de db' })
  ).toBeInTheDocument();
  expect(screen.getByText('21 incidencias registradas')).toBeInTheDocument();
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
  prepareApi();
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

test('explains when the server has no confirmed incidents', async () => {
  prepareApi({ items: [], total: 0 });

  renderHistory();

  expect(
    await screen.findByText('Este servidor todavía no tiene incidencias confirmadas.')
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
