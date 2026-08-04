import React, { act } from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ServerHealth from './ServerHealth';
import {
  getHealthStatus,
  getHealthStatusHistory,
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
  getHealthStatusHistory: jest.fn(),
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

const buckets = (status = 'ok') =>
  Array.from({ length: 96 }, (_, index) => ({
    start: new Date(Date.UTC(2026, 7, 3, 10, index * 15)).toISOString(),
    status
  }));

const healthyServer = {
  serverId: 1,
  name: 'Magma Nodo 1',
  url: 'https://magma.example/health',
  checkedAt: '2026-08-04T10:00:00.000Z',
  status: 'ok',
  components: {
    core: {
      name: 'Core',
      status: 'ok',
      errors: [],
      info: { message: 'Todo correcto' }
    }
  },
  error: null,
  warning: null,
  info: { connection: 'Conexión validada' },
  incident: null
};

const healthySnapshot = {
  state: 'active',
  started: true,
  running: false,
  lastRunAt: '2026-08-04T10:00:00.000Z',
  nextRunAt: '2026-08-04T10:01:00.000Z',
  lastError: null,
  servers: { 'Magma Nodo 1': healthyServer }
};

const historyResponse = {
  from: '2026-08-03T10:00:00.000Z',
  to: '2026-08-04T10:00:00.000Z',
  bucketMinutes: 15,
  servers: [
    {
      serverId: 1,
      availabilityPercent: 100,
      buckets: buckets('ok')
    }
  ]
};

const prepareApi = ({
  snapshot = healthySnapshot,
  history = historyResponse,
  historyError = null
} = {}) => {
  getHealthStatus.mockResolvedValue({ data: snapshot });
  if (historyError) getHealthStatusHistory.mockRejectedValue(historyError);
  else getHealthStatusHistory.mockResolvedValue({ data: history });
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

test('shows one 24-hour row without healthy check or incident detail', async () => {
  prepareApi();

  const { container } = renderHealth();

  expect(await screen.findByText('Magma Nodo 1')).toBeInTheDocument();
  expect(screen.queryByText('Monitor activo')).not.toBeInTheDocument();
  expect(screen.getByText(/Última comprobación:/)).toBeInTheDocument();
  expect(screen.getByText(/Próxima comprobación:/)).toBeInTheDocument();
  expect(
    screen.queryByText(/Estado actual y evolución/i)
  ).not.toBeInTheDocument();
  expect(screen.getByText('Operativo')).toBeInTheDocument();
  expect(screen.getByText('Últimas 24 horas')).toBeInTheDocument();
  expect(
    screen.getAllByRole('img', { name: /15 minutos/i })
  ).toHaveLength(96);
  expect(container.querySelector('.server-list')).toHaveClass('server-list');
  expect(screen.queryByText('Core')).not.toBeInTheDocument();
  expect(screen.queryByText('Todo correcto')).not.toBeInTheDocument();
  expect(screen.queryByText('Conexión validada')).not.toBeInTheDocument();
  expect(screen.queryByText(/Incidencia de/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Servicio recuperado')).not.toBeInTheDocument();
  expect(getHealthIncidents).not.toHaveBeenCalled();
});

test('keeps navigation to the dedicated incident history', async () => {
  prepareApi();
  const { container } = renderHealth();

  const link = await screen.findByRole('link', { name: 'Ver histórico' });
  expect(link).toHaveAttribute('href', '/health/servers/1/history');
  expect(link.closest('.server-header-actions')).toBeInTheDocument();
  expect(container.querySelector('.server-row-footer')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Editar Magma Nodo 1' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Eliminar Magma Nodo 1' })
  ).not.toBeInTheDocument();
});

test('groups history and edit actions in the server header for admins', async () => {
  mockEditMode = true;
  prepareApi();
  renderHealth();

  const actions = (await screen.findByRole('link', { name: 'Ver histórico' }))
    .closest('.server-header-actions');
  expect(
    within(actions).getByRole('button', { name: 'Editar Magma Nodo 1' })
  ).toBeInTheDocument();
  expect(
    within(actions).getByRole('button', { name: 'Eliminar Magma Nodo 1' })
  ).toBeInTheDocument();
});

test('shows warning checks in yellow while hiding healthy checks', async () => {
  prepareApi({
    snapshot: {
      ...healthySnapshot,
      servers: {
        'Magma Nodo 1': {
          ...healthyServer,
          status: 'warning',
          warning: {
            kind: 'component',
            message: 'Components warning: db',
            components: ['db']
          },
          components: {
            core: healthyServer.components.core,
            db: {
              name: 'Database',
              status: 'warning',
              errors: [
                { severity: 'warning', message: 'Bloqueo en BD: 30 s' }
              ],
              info: { bloqueos_sesiones: 1 }
            }
          }
        }
      }
    }
  });

  renderHealth();

  expect(await screen.findByText('Parcialmente degradado')).toBeInTheDocument();
  const issue = within(
    screen.getByRole('region', { name: 'Checks con problemas actuales' })
  ).getByRole('article');
  expect(issue).toHaveTextContent('Database');
  expect(issue).toHaveTextContent('Aviso');
  expect(screen.getByText('Bloqueo en BD: 30 s')).toBeInTheDocument();
  expect(screen.queryByText('Core')).not.toBeInTheDocument();
});

test('shows current errors before current warnings', async () => {
  prepareApi({
    snapshot: {
      ...healthySnapshot,
      servers: {
        'Magma Nodo 1': {
          ...healthyServer,
          status: 'error',
          error: {
            kind: 'component',
            message: 'Components failed: db',
            components: ['db']
          },
          components: {
            cache: {
              name: 'Cache',
              status: 'warning',
              errors: [{ severity: 'warning', message: 'Cache al límite' }]
            },
            db: {
              name: 'Database',
              status: 'error',
              errors: [{ severity: 'error', message: 'Bloqueo crítico' }]
            },
            core: healthyServer.components.core
          }
        }
      }
    }
  });

  renderHealth();

  expect(await screen.findByText('Servicio degradado')).toBeInTheDocument();
  const issues = within(
    screen.getByRole('region', { name: 'Checks con problemas actuales' })
  ).getAllByRole('article');
  expect(issues).toHaveLength(2);
  expect(issues[0]).toHaveTextContent('Database');
  expect(issues[0]).toHaveTextContent('Error');
  expect(issues[1]).toHaveTextContent('Cache');
  expect(issues[1]).toHaveTextContent('Aviso');
});

test('keeps current diagnostics when status history is unavailable', async () => {
  prepareApi({
    snapshot: {
      ...healthySnapshot,
      servers: {
        'Magma Nodo 1': {
          ...healthyServer,
          status: 'error',
          components: {},
          error: {
            kind: 'network',
            message: 'connect ECONNREFUSED',
            components: []
          },
          info: { connection: 'connect ECONNREFUSED' }
        }
      }
    },
    historyError: new Error('history unavailable')
  });

  const { container } = renderHealth();

  expect(await screen.findByText('Histórico no disponible')).toBeInTheDocument();
  expect(screen.getByText('connect ECONNREFUSED')).toBeInTheDocument();
  expect(container.querySelectorAll('.status-strip-block.unknown')).toHaveLength(96);
});

test('ordinary refresh reads status and history without starting a check', async () => {
  prepareApi();
  renderHealth();
  await screen.findByText('Magma Nodo 1');
  getHealthStatus.mockClear();
  getHealthStatusHistory.mockClear();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Actualizar vista/i }));
  });

  await waitFor(() => expect(getHealthStatus).toHaveBeenCalledTimes(1));
  expect(getHealthStatusHistory).toHaveBeenCalledTimes(1);
  expect(triggerHealthCheck).not.toHaveBeenCalled();
});

test('admin immediate check refreshes the 24-hour history', async () => {
  mockEditMode = true;
  prepareApi();
  renderHealth();
  await screen.findByText('Magma Nodo 1');
  getHealthStatusHistory.mockClear();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Comprobar ahora/i }));
  });

  await waitFor(() => expect(triggerHealthCheck).toHaveBeenCalledTimes(1));
  expect(getHealthStatusHistory).toHaveBeenCalledTimes(1);
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

test('reports an unavailable monitor without hiding configured servers', async () => {
  prepareApi({
    snapshot: {
      ...healthySnapshot,
      started: false,
      state: 'stopped',
      lastError: 'database unavailable',
      servers: {}
    }
  });

  renderHealth();

  expect(await screen.findByText('Monitor no disponible')).toBeInTheDocument();
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
