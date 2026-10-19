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
  it('links to the source repository', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: /source on github/i }) as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/borgel/geargoober');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

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

  it('labels measurement fields with units', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    const unitOf = (label: string) => screen.getByLabelText(label).closest('.num-wrap')?.querySelector('.unit-tag')?.textContent;
    expect(unitOf('G1 face width')).toBe('mm');
    expect(unitOf('G1 z offset')).toBe('mm');
    expect(unitOf('G1 teeth')).toBe('T');
    expect(unitOf('Mesh 1 angle')).toBe('°');
    expect(unitOf('S1 bore size')).toBe('mm');
    expect(unitOf('Input speed')).toBe('rpm');
    expect(unitOf('Pitch value')).toBe('mm');
    fireEvent.change(screen.getByLabelText('Pitch system'), { target: { value: 'dp' } });
    expect(unitOf('Pitch value')).toBe('teeth/in');
    fireEvent.click(screen.getByText('Fit allowances'));
    expect(unitOf('Clearance')).toBe('× m');
    expect(unitOf('Kerf')).toBe('mm');
  });

  it('sets an escapement tick rate and shows the step per tick', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    const ticks = screen.getByLabelText('Escapement ticks') as HTMLInputElement;
    expect(ticks.closest('.num-wrap')?.querySelector('.unit-tag')?.textContent).toBe('/s');
    expect(ticks.value).toBe('');
    fireEvent.input(ticks, { target: { value: '2' } });
    expect(localStorage.getItem('geargoober.project')).toContain('input S1 rpm 1000 ticks 2');
    const results = screen.getByTestId('results');
    // 1000 rpm at 2 ticks/s: 3000° per tick on S1, −1500° on S2
    expect(results.textContent).toMatch(/step \/ tick/i);
    expect(results.textContent).toContain('3000°');
    expect(results.textContent).toContain('-1500°');
    fireEvent.input(ticks, { target: { value: '' } });
    expect(localStorage.getItem('geargoober.project')).not.toContain('ticks');
  });

  it('chooses the corner relief style', () => {
    localStorage.setItem('geargoober.project', SMALL);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Corner relief style'), { target: { value: 'dogbone' } });
    expect(localStorage.getItem('geargoober.project')).toContain('relief_style dogbone');
  });

  it('asks for a mesh partner instead of pretending one is chosen', () => {
    localStorage.setItem('geargoober.project', 'input S1 rpm 1\nshaft S1 bore round 5\ngear G1 on S1 teeth 20 width 6\n');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Add mesh' }));
    const partner = screen.getByLabelText('Mesh 1 partner') as HTMLSelectElement;
    expect(partner.value).toBe('');
    expect(partner.selectedOptions[0].textContent).toBe('Choose…');
  });

  it('shows a non-standard pressure angle from text', () => {
    localStorage.setItem('geargoober.project', 'pressure_angle 25\n' + SMALL);
    render(<App />);
    const pa = screen.getByLabelText('Pressure angle') as HTMLSelectElement;
    expect(pa.selectedOptions[0].textContent).toBe('25°');
  });

  it('opens the gear guide, also from a field help button', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Gear guide' }));
    const guide = screen.getByRole('dialog', { name: 'Gear guide' });
    for (const topic of ['Module', 'Pressure angle', 'Tooth count', 'Backlash', 'Root clearance', 'Kerf', 'Face width', 'Contact ratio', 'Corner relief']) {
      expect(guide.textContent!.toLowerCase()).toContain(topic.toLowerCase());
    }
    fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
    fireEvent.click(screen.getByRole('button', { name: 'About pressure angle' }));
    expect(screen.getByRole('dialog', { name: 'Gear guide' })).toBeTruthy();
  });
});
