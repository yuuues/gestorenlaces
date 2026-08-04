import React, { act } from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ServerHealth from './ServerHealth';
import {
  getHealthStatus,
  getHealthIncidents,
  getServers,
  triggerHealthCheck
} from '../api';

let mockEditMode = false;
const mockLock = jest.fn();
let originalConsoleError;

jest.mock('../EditModeContext', () => ({
  useEditMode: () => ({ editMode: mockEditMode, lock: mockLock })
}));

jest.mock('../api', () => ({
  getHealthStatus: jest.fn(),
  getHealthIncidents: jest.fn(),
  getServers: jest.fn(),
  triggerHealthCheck: jest.fn(),
  deleteServer: jest.fn()
}));

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

const healthySnapshot = {
  started: true,
  running: false,
  lastRunAt: '2026-07-28T10:00:00.000Z',
  nextRunAt: '2026-07-28T10:01:00.000Z',
  lastError: null,
  servers: {
    'Magma Nodo 1': {
      serverId: 1,
      name: 'Magma Nodo 1',
      url: 'https://magma.example/health',
      checkedAt: '2026-07-28T10:00:00.000Z',
      status: 'ok',
      components: {},
      error: null,
      info: { connection: 'Conexión validada' },
      incident: null
    }
  }
};

const openIncident = {
  id: 7,
  server_id: 1,
  server_name: 'Magma Nodo 1',
  status: 'open',
  first_failed_at: '2026-07-28T09:45:00.000Z',
  last_failed_at: '2026-07-28T10:00:00.000Z',
  consecutive_failures: 16,
  last_error: {
    kind: 'component',
    message: 'Components failed: Database',
    components: ['Database']
  }
};

const prepareApi = ({
  snapshot = healthySnapshot,
  incidents = []
} = {}) => {
  getHealthStatus.mockResolvedValue({ data: snapshot });
  getHealthIncidents.mockResolvedValue({ data: incidents });
  getServers.mockResolvedValue({
    data: [
      {
        id: 1,
        name: 'Magma Nodo 1',
        url: 'https://magma.example/health',
        description: 'Nodo principal'
      }
    ]
  });
  triggerHealthCheck.mockResolvedValue({ data: snapshot });
};

const renderHealth = () =>
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ServerHealth />
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockEditMode = false;
});

test('shows autonomous monitor metadata and the latest server state', async () => {
  prepareApi();

  renderHealth();

  expect(await screen.findByText('Monitor activo')).toBeInTheDocument();
  expect(screen.getByText(/Última comprobación:/)).toBeInTheDocument();
  expect(screen.getByText(/Próxima comprobación:/)).toBeInTheDocument();
  expect(screen.getByText('Magma Nodo 1')).toBeInTheDocument();
  expect(screen.getByText('Conexión validada')).toBeInTheDocument();
});

test('links each configured server to its dedicated history', async () => {
  prepareApi();

  renderHealth();

  const link = await screen.findByRole('link', { name: 'Ver histórico' });
  expect(link).toHaveAttribute('href', '/health/servers/1/history');
});

test('shows warning badges and expands the warning component details', async () => {
  prepareApi({
    snapshot: {
      ...healthySnapshot,
      servers: {
        'Magma Nodo 1': {
          ...healthySnapshot.servers['Magma Nodo 1'],
          status: 'warning',
          warning: {
            kind: 'component',
            message: 'Components warning: db',
            components: ['db']
          },
          info: { connection: 'Components warning: db' },
          components: {
            db: {
              name: 'db',
              status: 'warning',
              errors: [
                {
                  severity: 'warning',
                  message: 'Bloqueo en BD: 1 sesión bloqueada.'
                }
              ],
              info: { bloqueos_sesiones: '1' }
            }
          }
        }
      }
    }
  });

  renderHealth();

  expect(await screen.findByText('Components warning: db')).toBeInTheDocument();
  expect(screen.getAllByText('Aviso')).toHaveLength(2);
  expect(
    await screen.findByText('Bloqueo en BD: 1 sesión bloqueada.')
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/Incidencia (abierta|resuelta)/i)
  ).not.toBeInTheDocument();
});

test('has no browser Start or Stop monitoring controls', async () => {
  prepareApi();

  renderHealth();
  await screen.findByText('Magma Nodo 1');

  expect(
    screen.queryByRole('button', { name: /^Start$|^Stop$/i })
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Auto-refresh every/i)).not.toBeInTheDocument();
});

test('ordinary refresh only reads status and incidents', async () => {
  prepareApi();
  renderHealth();
  await screen.findByText('Magma Nodo 1');
  getHealthStatus.mockClear();
  getHealthIncidents.mockClear();

  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: /Actualizar vista/i })
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  await waitFor(() => expect(getHealthStatus).toHaveBeenCalledTimes(1));
  expect(getHealthIncidents).toHaveBeenCalledTimes(1);
  expect(triggerHealthCheck).not.toHaveBeenCalled();
});

test('admin can request an immediate server-side check', async () => {
  mockEditMode = true;
  prepareApi();
  renderHealth();
  await screen.findByText('Magma Nodo 1');

  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: /Comprobar ahora/i })
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  await waitFor(() => expect(triggerHealthCheck).toHaveBeenCalledTimes(1));
});

test('shows the open incident stored for a server', async () => {
  prepareApi({ incidents: [openIncident] });

  renderHealth();

  expect(
    await screen.findByRole('heading', { name: 'Incidencia de Database' })
  ).toBeInTheDocument();
  expect(screen.getByText('Abierta')).toBeInTheDocument();
  expect(screen.getByText('Components failed: Database')).toBeInTheDocument();
  expect(screen.getByText(/16 fallos consecutivos/)).toBeInTheDocument();
  expect(screen.getByText('Error detectado')).toBeInTheDocument();
  expect(screen.getByText('En curso')).toBeInTheDocument();
});

test('shows start and end timing for a resolved incident', async () => {
  const resolvedIncident = {
    ...openIncident,
    status: 'resolved',
    resolved_at: '2026-07-28T10:02:00.000Z'
  };
  prepareApi({ incidents: [resolvedIncident] });

  renderHealth();

  expect(await screen.findByText('Resuelta')).toBeInTheDocument();
  expect(screen.getByText('Error detectado')).toBeInTheDocument();
  expect(screen.getByText('Servicio recuperado')).toBeInTheDocument();
});

test('uses the server name for a failure without failed components', async () => {
  prepareApi({
    incidents: [
      {
        ...openIncident,
        last_error: {
          kind: 'timeout',
          message: 'timeout of 5000ms exceeded',
          components: []
        }
      }
    ]
  });

  renderHealth();

  expect(
    await screen.findByRole('heading', {
      name: 'Incidencia de Magma Nodo 1'
    })
  ).toBeInTheDocument();
});

test('reports an unavailable monitor without hiding configured servers', async () => {
  prepareApi({
    snapshot: {
      ...healthySnapshot,
      started: false,
      lastError: 'database unavailable'
    }
  });

  renderHealth();

  expect(
    await screen.findByText('Monitor no disponible')
  ).toBeInTheDocument();
  expect(screen.getByText('database unavailable')).toBeInTheDocument();
  expect(screen.getByText('Magma Nodo 1')).toBeInTheDocument();
});

test('shows a degraded monitor when autonomous rounds are failing', async () => {
  prepareApi({
    snapshot: {
      ...healthySnapshot,
      state: 'degraded',
      lastError: 'database unavailable'
    }
  });

  renderHealth();

  expect(await screen.findByText('Monitor degradado')).toBeInTheDocument();
  expect(screen.getByText('database unavailable')).toBeInTheDocument();
});
