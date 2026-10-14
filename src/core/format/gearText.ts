// The line-based `.gear` text format. See docs/superpowers/specs for the grammar.
import {
  DEFAULT_RACK_BACK,
  ID_PATTERN,
  newProject,
  type Bore,
  type Gear,
  type Mesh,
  type Project,
  type Rack,
  type Shaft,
} from '../model';

export interface ParseError {
  line: number;
  col: number;
  message: string;
}

export type ParseResult = { ok: true; project: Project } | { ok: false; errors: ParseError[] };

interface Token {
  text: string;
  col: number;
  quoted: boolean;
}

class LineError extends Error {
  constructor(
    public col: number,
    message: string,
  ) {
    super(message);
  }
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
    } else if (ch === '#') {
      break;
    } else if (ch === '"') {
      const start = i;
      let text = '';
      i++;
      let closed = false;
      while (i < line.length) {
        if (line[i] === '\\' && i + 1 < line.length) {
          text += line[i + 1];
          i += 2;
        } else if (line[i] === '"') {
          closed = true;
          i++;
          break;
        } else {
          text += line[i++];
        }
      }
      if (!closed) throw new LineError(start + 1, 'unterminated string');
      tokens.push({ text, col: start + 1, quoted: true });
    } else {
      const start = i;
      while (i < line.length && !' \t\r#"'.includes(line[i])) i++;
      tokens.push({ text: line.slice(start, i), col: start + 1, quoted: false });
    }
  }
  return tokens;
}

/** Cursor over one line's tokens with typed accessors that raise column-accurate errors. */
class Cursor {
  private i = 1;
  constructor(
    private tokens: Token[],
    private lineLength: number,
  ) {}

  get done(): boolean {
    return this.i >= this.tokens.length;
  }

  private endCol(): number {
    const last = this.tokens[this.tokens.length - 1];
    return last ? last.col + last.text.length + 1 : this.lineLength + 1;
  }

  next(what: string): Token {
    const t = this.tokens[this.i];
    if (!t) throw new LineError(this.endCol(), `expected ${what}`);
    this.i++;
    return t;
  }

  word(what: string): string {
    const t = this.next(what);
    if (t.quoted) throw new LineError(t.col, `expected ${what}, got a quoted string`);
    return t.text;
  }

  str(what: string): string {
    return this.next(what).text;
  }

  num(what: string): number {
    const t = this.next(what);
    const n = Number(t.text);
    if (t.quoted || t.text === '' || !Number.isFinite(n)) {
      throw new LineError(t.col, `expected a number for ${what}, got "${t.text}"`);
    }
    return n;
  }

  onOff(what: string): boolean {
    const t = this.next(what);
    if (t.text === 'on') return true;
    if (t.text === 'off') return false;
    throw new LineError(t.col, `expected on or off for ${what}, got "${t.text}"`);
  }

  peekCol(): number {
    return this.tokens[this.i]?.col ?? this.endCol();
  }

  /** Iterate remaining `key value...` pairs. */
  keys(handle: (key: string, col: number) => void): void {
    while (!this.done) {
      const col = this.peekCol();
      handle(this.word('a keyword'), col);
    }
  }
}

function parseBore(c: Cursor): Bore {
  const col = c.peekCol();
  const kind = c.word('bore kind');
  switch (kind) {
    case 'round':
      return { kind, dia: c.num('bore diameter') };
    case 'dflat':
      return { kind, dia: c.num('bore diameter'), flatDepth: c.num('flat depth') };
    case 'hex':
      return { kind, acrossFlats: c.num('across-flats size') };
    case 'square':
      return { kind, side: c.num('square side') };
    default:
      throw new LineError(col, `unknown bore kind "${kind}" (round, dflat, hex, square)`);
  }
}

function require<T>(value: T | undefined, col: number, what: string): T {
  if (value === undefined) throw new LineError(col, `missing ${what}`);
  return value;
}

export function parseGear(text: string): ParseResult {
  const project = newProject();
  const errors: ParseError[] = [];
  const ids = new Set<string>();
  const lines = text.split('\n');

  const claimId = (id: string, col: number) => {
    if (!ID_PATTERN.test(id)) throw new LineError(col, `id "${id}" may only use letters, digits, _ . or -`);
    if (ids.has(id)) throw new LineError(col, `duplicate id "${id}"`);
    ids.add(id);
  };

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    try {
      const tokens = tokenize(raw);
      if (tokens.length === 0) return;
      const head = tokens[0];
      const c = new Cursor(tokens, raw.length);
      const unknownKey = (key: string, col: number): never => {
        throw new LineError(col, `unknown option "${key}" for ${head.text}`);
      };

      switch (head.text) {
        case 'project':
          project.name = c.str('project name');
          break;
        case 'pitch': {
          const col = c.peekCol();
          const system = c.word('pitch system');
          if (system !== 'module' && system !== 'dp') throw new LineError(col, `pitch must be "module" or "dp"`);
          project.pitch = { system, value: c.num('pitch value') };
          break;
        }
        case 'pressure_angle':
          project.pressureAngleDeg = c.num('pressure angle');
          break;
        case 'fit':
          c.keys((key, col) => {
            if (key === 'backlash') project.fit.backlashMm = c.num('backlash');
            else if (key === 'clearance') project.fit.clearanceCoef = c.num('clearance');
            else if (key === 'kerf') project.fit.kerfMm = c.num('kerf');
            else if (key === 'relief') project.fit.cornerReliefMm = c.num('relief');
            else if (key === 'relief_style') {
              const sc = c.peekCol();
              const style = c.word('relief style');
              if (style !== 'fillet' && style !== 'dogbone') throw new LineError(sc, `relief_style must be fillet or dogbone, got "${style}"`);
              project.fit.reliefStyle = style;
            }
            else unknownKey(key, col);
          });
          break;
        case 'export':
          c.keys((key, col) => {
            if (key === 'kerf_dxf') project.exportPrefs.kerfDxf = c.onOff('kerf_dxf');
            else if (key === 'kerf_step') project.exportPrefs.kerfStep = c.onOff('kerf_step');
            else unknownKey(key, col);
          });
          break;
        case 'input': {
          const target = c.word('input target id');
          const col = c.peekCol();
          const unit = c.word('rpm or mmps');
          if (unit === 'rpm') project.input = { kind: 'shaft', shaftId: target, rpm: c.num('rpm') };
          else if (unit === 'mmps') project.input = { kind: 'rack', rackId: target, mmPerSec: c.num('mm/s') };
          else throw new LineError(col, `expected "rpm" or "mmps", got "${unit}"`);
          break;
        }
        case 'shaft': {
          const idCol = c.peekCol();
          const id = c.word('shaft id');
          let name = id;
          let bore: Bore | undefined;
          c.keys((key, col) => {
            if (key === 'name') name = c.str('name');
            else if (key === 'bore') bore = parseBore(c);
            else unknownKey(key, col);
          });
          const shaft: Shaft = { id, name, bore: require(bore, c.peekCol(), 'bore') };
          claimId(id, idCol);
          project.shafts.push(shaft);
          break;
        }
        case 'gear': {
          const idCol = c.peekCol();
          const id = c.word('gear id');
          let name = id;
          let shaftId: string | undefined;
          let teeth: number | undefined;
          let faceWidth: number | undefined;
          let zOffset = 0;
          c.keys((key, col) => {
            if (key === 'name') name = c.str('name');
            else if (key === 'on') shaftId = c.word('shaft id');
            else if (key === 'teeth') teeth = c.num('teeth');
            else if (key === 'width') faceWidth = c.num('width');
            else if (key === 'z') zOffset = c.num('z');
            else unknownKey(key, col);
          });
          const end = c.peekCol();
          const gear: Gear = {
            id,
            name,
            shaftId: require(shaftId, end, '"on <shaft>"'),
            teeth: require(teeth, end, '"teeth <n>"'),
            faceWidth: require(faceWidth, end, '"width <mm>"'),
            zOffset,
          };
          claimId(id, idCol);
          project.gears.push(gear);
          break;
        }
        case 'rack': {
          const idCol = c.peekCol();
          const id = c.word('rack id');
          let name = id;
          let teeth: number | undefined;
          let faceWidth: number | undefined;
          let backHeight = DEFAULT_RACK_BACK;
          c.keys((key, col) => {
            if (key === 'name') name = c.str('name');
            else if (key === 'teeth') teeth = c.num('teeth');
            else if (key === 'width') faceWidth = c.num('width');
            else if (key === 'back') backHeight = c.num('back height');
            else unknownKey(key, col);
          });
          const end = c.peekCol();
          const rack: Rack = {
            id,
            name,
            teeth: require(teeth, end, '"teeth <n>"'),
            faceWidth: require(faceWidth, end, '"width <mm>"'),
            backHeight,
          };
          claimId(id, idCol);
          project.racks.push(rack);
          break;
        }
        case 'mesh': {
          const a = c.word('first gear id');
          const b = c.word('second gear or rack id');
          let angleDeg: number | undefined;
          let offset: number | undefined;
          c.keys((key, col) => {
            if (key === 'angle') angleDeg = c.num('angle');
            else if (key === 'offset') offset = c.num('offset');
            else unknownKey(key, col);
          });
          const mesh: Mesh = { a, b, angleDeg: require(angleDeg, c.peekCol(), '"angle <deg>"') };
          if (offset !== undefined) mesh.offset = offset;
          project.meshes.push(mesh);
          break;
        }
        default:
          throw new LineError(head.col, `unknown statement "${head.text}"`);
      }
      if (!c.done) throw new LineError(c.peekCol(), 'unexpected extra text');
    } catch (e) {
      if (e instanceof LineError) errors.push({ line: lineNo, col: e.col, message: e.message });
      else errors.push({ line: lineNo, col: 1, message: String(e) });
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, project };
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const num = (n: number) => String(n);

function boreText(b: Bore): string {
  switch (b.kind) {
    case 'round':
      return `bore round ${num(b.dia)}`;
    case 'dflat':
      return `bore dflat ${num(b.dia)} ${num(b.flatDepth)}`;
    case 'hex':
      return `bore hex ${num(b.acrossFlats)}`;
    case 'square':
      return `bore square ${num(b.side)}`;
  }
}

const nameText = (id: string, name: string) => (name !== id ? ` name ${quote(name)}` : '');

export function serializeGear(p: Project): string {
  const out: string[] = [];
  out.push(`project ${quote(p.name)}`);
  out.push(`pitch ${p.pitch.system} ${num(p.pitch.value)}`);
  out.push(`pressure_angle ${num(p.pressureAngleDeg)}`);
  const f = p.fit;
  out.push(
    `fit backlash ${num(f.backlashMm)} clearance ${num(f.clearanceCoef)} kerf ${num(f.kerfMm)} relief ${num(f.cornerReliefMm)} relief_style ${f.reliefStyle}`,
  );
  out.push(
    `export kerf_dxf ${p.exportPrefs.kerfDxf ? 'on' : 'off'} kerf_step ${p.exportPrefs.kerfStep ? 'on' : 'off'}`,
  );
  if (p.input.kind === 'shaft') {
    if (p.input.shaftId) out.push(`input ${p.input.shaftId} rpm ${num(p.input.rpm)}`);
  } else {
    out.push(`input ${p.input.rackId} mmps ${num(p.input.mmPerSec)}`);
  }
  out.push('');
  for (const s of p.shafts) out.push(`shaft ${s.id}${nameText(s.id, s.name)} ${boreText(s.bore)}`);
  for (const g of p.gears) {
    const z = g.zOffset !== 0 ? ` z ${num(g.zOffset)}` : '';
    out.push(
      `gear  ${g.id}${nameText(g.id, g.name)} on ${g.shaftId} teeth ${num(g.teeth)} width ${num(g.faceWidth)}${z}`,
    );
  }
  for (const r of p.racks) {
    out.push(
      `rack  ${r.id}${nameText(r.id, r.name)} teeth ${num(r.teeth)} width ${num(r.faceWidth)} back ${num(r.backHeight)}`,
    );
  }
  for (const m of p.meshes) {
    const off = m.offset !== undefined ? ` offset ${num(m.offset)}` : '';
    out.push(`mesh  ${m.a} ${m.b} angle ${num(m.angleDeg)}${off}`);
  }
  return out.join('\n') + '\n';
}
