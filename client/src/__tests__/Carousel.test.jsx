import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Carousel from '../components/Carousel';

const makeUnit = (id, overrides = {}) => ({
  id,
  type: 'snippet',
  content: `unit ${id}`,
  createdAt: Date.now(),
  ...overrides,
});

describe('Carousel', () => {
  it('renders null when units is empty', () => {
    const { container } = render(<Carousel title="Test" units={[]} onUnitClick={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when units is undefined', () => {
    const { container } = render(<Carousel title="Test" onUnitClick={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the title', () => {
    render(<Carousel title="Added Today" units={[makeUnit(1)]} onUnitClick={vi.fn()} />);
    expect(screen.getByText('Added Today')).toBeInTheDocument();
  });

  it('renders a card for each unit', () => {
    const units = [makeUnit(1), makeUnit(2), makeUnit(3)];
    render(<Carousel title="Row" units={units} onUnitClick={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('calls onUnitClick with (unit, units, index) for the first card', () => {
    const units = [makeUnit(1), makeUnit(2), makeUnit(3)];
    const onUnitClick = vi.fn();
    render(<Carousel title="Row" units={units} onUnitClick={onUnitClick} />);

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(onUnitClick).toHaveBeenCalledTimes(1);
    expect(onUnitClick).toHaveBeenCalledWith(units[0], units, 0);
  });

  it('calls onUnitClick with the correct index for a middle card', () => {
    const units = [makeUnit(1), makeUnit(2), makeUnit(3)];
    const onUnitClick = vi.fn();
    render(<Carousel title="Row" units={units} onUnitClick={onUnitClick} />);

    fireEvent.click(screen.getAllByRole('button')[1]);

    expect(onUnitClick).toHaveBeenCalledWith(units[1], units, 1);
  });

  it('calls onUnitClick with the correct index for the last card', () => {
    const units = [makeUnit(10), makeUnit(20), makeUnit(30)];
    const onUnitClick = vi.fn();
    render(<Carousel title="Row" units={units} onUnitClick={onUnitClick} />);

    fireEvent.click(screen.getAllByRole('button')[2]);

    expect(onUnitClick).toHaveBeenCalledWith(units[2], units, 2);
  });

  it('passes the full units array (not a copy) to onUnitClick', () => {
    const units = [makeUnit(1), makeUnit(2)];
    const onUnitClick = vi.fn();
    render(<Carousel title="Row" units={units} onUnitClick={onUnitClick} />);

    fireEvent.click(screen.getAllByRole('button')[0]);

    const [, calledUnits] = onUnitClick.mock.calls[0];
    expect(calledUnits).toBe(units);
  });
});
