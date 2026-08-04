import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ServerStatusStrip from './ServerStatusStrip';

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

const history = ({ availabilityPercent = 50 } = {}) => ({
  serverId: 1,
  availabilityPercent,
  buckets: Array.from({ length: 96 }, (_, index) => ({
    start: new Date(Date.UTC(2026, 7, 3, 10, index * 15)).toISOString(),
    status: ['ok', 'warning', 'error', 'unknown'][index % 4]
  }))
});

test('renders one accessible block per 15-minute interval', () => {
  const { container } = render(
    <ServerStatusStrip history={history()} unavailable={false} />
  );

  const blocks = screen.getAllByRole('img');
  expect(blocks).toHaveLength(96);
  expect(blocks[0]).toHaveAccessibleName(/15 minutos.*Operativo/i);
  expect(blocks[1]).toHaveAccessibleName(
    /15 minutos.*Parcialmente degradado/i
  );
  expect(blocks[2]).toHaveAccessibleName(/15 minutos.*Servicio degradado/i);
  expect(blocks[3]).toHaveAccessibleName(/15 minutos.*Sin datos/i);
  expect(container.querySelectorAll('.status-strip-block.ok')).toHaveLength(24);
  expect(container.querySelectorAll('.status-strip-block.warning')).toHaveLength(24);
  expect(container.querySelectorAll('.status-strip-block.error')).toHaveLength(24);
  expect(container.querySelectorAll('.status-strip-block.unknown')).toHaveLength(24);
  expect(screen.getByText('50 % operativo')).toBeInTheDocument();
  expect(screen.getByText('Hace 24 h')).toBeInTheDocument();
  expect(screen.getByText('Ahora')).toBeInTheDocument();
});

test('uses 96 grey blocks when history is unavailable', () => {
  const { container } = render(
    <ServerStatusStrip history={null} unavailable />
  );

  expect(screen.getAllByRole('img')).toHaveLength(96);
  expect(container.querySelectorAll('.status-strip-block.unknown')).toHaveLength(96);
  expect(screen.getByText('Histórico no disponible')).toBeInTheDocument();
});

test('does not report zero availability when every bucket is unknown', () => {
  render(
    <ServerStatusStrip
      history={history({ availabilityPercent: null })}
      unavailable={false}
    />
  );

  expect(screen.getByText('Disponibilidad no calculable')).toBeInTheDocument();
  expect(screen.queryByText('0 % operativo')).not.toBeInTheDocument();
});
