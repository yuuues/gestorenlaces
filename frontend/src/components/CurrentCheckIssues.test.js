import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CurrentCheckIssues, { selectCurrentIssues } from './CurrentCheckIssues';

let originalConsoleError;

beforeAll(() => {
  originalConsoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((message, ...args) => {
    if (typeof message === 'string' && message.includes('ReactDOMTestUtils.act')) {
      return;
    }
    originalConsoleError(message, ...args);
  });
});

afterAll(() => {
  console.error.mockRestore();
});

const server = {
  serverId: 1,
  name: 'Magma Nodo 1',
  status: 'error',
  components: {
    cache: {
      name: 'Cache',
      status: 'warning',
      errors: [{ severity: 'warning', message: 'Cache con presión' }],
      info: { entries: 930 }
    },
    core: {
      name: 'Core',
      status: 'ok',
      errors: [],
      info: { message: 'Todo correcto' }
    },
    db: {
      name: 'Database',
      status: 'error',
      errors: [{ severity: 'error', message: 'Bloqueo en BD' }],
      info: { bloqueos_sesiones: 1 }
    }
  },
  error: {
    kind: 'component',
    message: 'Components failed: db',
    components: ['db']
  },
  info: { connection: 'Components failed: db' }
};

test('selects errors before warnings and omits healthy checks', () => {
  expect(
    selectCurrentIssues(server).map(([key, component]) => [
      key,
      component.status
    ])
  ).toEqual([
    ['db', 'error'],
    ['cache', 'warning']
  ]);
});

test('renders current error and warning diagnostics without healthy details', () => {
  render(<CurrentCheckIssues server={server} />);

  const issues = screen.getAllByRole('article');
  expect(issues).toHaveLength(2);
  expect(issues[0]).toHaveTextContent('Database');
  expect(issues[0]).toHaveTextContent('Error');
  expect(issues[0]).toHaveTextContent('Bloqueo en BD');
  expect(issues[0]).toHaveTextContent('bloqueos_sesiones');
  expect(issues[1]).toHaveTextContent('Cache');
  expect(issues[1]).toHaveTextContent('Aviso');
  expect(issues[1]).toHaveTextContent('Cache con presión');
  expect(screen.queryByText('Core')).not.toBeInTheDocument();
  expect(screen.queryByText('Todo correcto')).not.toBeInTheDocument();
});

test('renders a server-level connection error without component diagnostics', () => {
  render(
    <CurrentCheckIssues
      server={{
        serverId: 2,
        name: 'API',
        status: 'error',
        components: {},
        error: {
          kind: 'network',
          message: 'connect ECONNREFUSED',
          components: []
        },
        info: { connection: 'connect ECONNREFUSED' }
      }}
    />
  );

  const issue = screen.getByRole('article');
  expect(issue).toHaveTextContent('Conexión');
  expect(issue).toHaveTextContent('Error');
  expect(issue).toHaveTextContent('connect ECONNREFUSED');
});

test('renders nothing when every check is healthy', () => {
  const { container } = render(
    <CurrentCheckIssues
      server={{
        serverId: 3,
        name: 'Web',
        status: 'ok',
        components: {
          core: { name: 'Core', status: 'ok', errors: [] }
        }
      }}
    />
  );

  expect(container).toBeEmptyDOMElement();
});
