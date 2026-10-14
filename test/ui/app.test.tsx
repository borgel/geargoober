// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App';

const SMALL = `project "UI test"
input S1 rpm 1000
shaft S1 bore round 5
shaft S2 bore round 5
gear G1 on S1 teeth 20 width 6
gear G2 on S2 teeth 40 width 6
mesh G1 G2 angle 0
`;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('App', () => {
  it('loads the example project on first run', () => {
    render(<App />);
    expect(screen.getAllByDisplayValue('G1').length).toBeGreaterThan(0);
    expect(screen.getByText(/two-stage reduction/i)).toBeTruthy();
  });

  it('restores the autosaved project', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    expect(screen.getByDisplayValue('UI test')).toBeTruthy();
  });

  it('updates results when a tooth count changes', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    const results = screen.getByTestId('results');
    expect(results.textContent).toContain('-500');
    const teeth = screen.getByLabelText('G1 teeth') as HTMLInputElement;
    fireEvent.input(teeth, { target: { value: '10' } });
    expect(results.textContent).toContain('-250');
    expect(localStorage.getItem('geargoober.project')).toContain('teeth 10');
  });

  it('shows solver issues and survives a blank number field', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    const teeth = screen.getByLabelText('G1 teeth') as HTMLInputElement;
    fireEvent.input(teeth, { target: { value: '' } });
    expect(screen.getByTestId('issues').textContent).toMatch(/G1: teeth must be/);
  });

  it('applies valid text edits and reports parse errors', async () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    const area = screen.getByLabelText('Project text') as HTMLTextAreaElement;
    fireEvent.input(area, { target: { value: SMALL + 'bogus line\n' } });
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByTestId('text-errors').textContent).toContain('line 8');
    fireEvent.input(area, { target: { value: SMALL.replace('teeth 40', 'teeth 80') } });
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByTestId('results').textContent).toContain('-250');
  });

  it('renders one diagram part per gear and rack', () => {
    render(<App />);
    expect(document.querySelectorAll('path[data-part]').length).toBe(7);
  });
});
