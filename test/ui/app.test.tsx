// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseGear } from '../../src/core/format/gearText';
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

  it('lists export files for a valid project', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('layout.dxf');
    expect(dialog.textContent).toContain('G1_z20_m1.step');
    expect(screen.getByRole('button', { name: 'Download all (.zip)' })).toBeTruthy();
  });

  it('remembers kerf export choices in the project', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
    fireEvent.click(screen.getByLabelText(/Offset STEP solids/));
    expect(localStorage.getItem('geargoober.project')).toContain('kerf_step on');
  });

  it('blocks export while there are errors', () => {
    localStorage.setItem('geargoober.project', SMALL.replace('teeth 20', 'teeth 2'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
    expect(screen.getByRole('dialog').textContent).toMatch(/Fix the errors/);
    expect(screen.queryByRole('button', { name: 'Download all (.zip)' })).toBeNull();
  });

  it('never autosaves a project that would not load again', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    fireEvent.input(screen.getByLabelText('G1 face width'), { target: { value: '' } });
    const saved = localStorage.getItem('geargoober.project')!;
    expect(parseGear(saved).ok).toBe(true);
    expect(saved).toContain('width 6');
  });

  it('keeps unreadable saved text instead of overwriting it', () => {
    localStorage.setItem('geargoober.project', 'gear G1 on S1 teeth NaN width 5\n');
    render(<App />);
    expect(localStorage.getItem('geargoober.project.unreadable')).toContain('teeth NaN');
    expect(screen.getByRole('status').textContent).toMatch(/couldn.t be read/i);
  });

  it('reverts an invalid id instead of renaming', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    const id = screen.getByLabelText('Gear G1 id') as HTMLInputElement;
    fireEvent.input(id, { target: { value: 'my gear' } });
    fireEvent.blur(id);
    expect(id.value).toBe('G1');
    fireEvent.input(id, { target: { value: 'G2' } });
    fireEvent.blur(id);
    expect(id.value).toBe('G1');
    expect(parseGear(localStorage.getItem('geargoober.project')!).ok).toBe(true);
  });

  it('refreshes the text editor when another project is loaded', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    expect((screen.getByLabelText('Project text') as HTMLTextAreaElement).value).toContain('two-stage');
  });

  it('keeps a text edit made just before switching back to parts', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.input(screen.getByLabelText('Project text'), { target: { value: SMALL.replace('teeth 40', 'teeth 80') } });
    fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
    expect(screen.getByTestId('results').textContent).toContain('-250');
  });
});
