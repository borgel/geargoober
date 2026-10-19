// View-only animated layout. Content is drawn in math coordinates inside a scale(1,-1) group.
import { activeTicks } from '../core/escapement';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fmt } from '../core/export/spec';
import { partProfile } from '../core/geometry/parts';
import { profileToPath } from '../core/geometry/svgpath';
import { animationClock, rackTravelSeconds, steppedTime } from './animation';
import type { Store } from './state';

interface Drawn {
  id: string;
  kind: 'gear' | 'rack';
  d: string;
  x: number;
  y: number;
  /** gear: phase (rad); rack: direction of local +x (rad) */
  angle: number;
  /** gear: rad/s; rack: mm/s */
  speed?: number;
  pitchR: number;
  rackPitch: number;
  rackLength: number;
  state: 'ccw' | 'cw' | 'stopped' | 'idle';
  /** Hover text; racks also use it as their on-canvas label. */
  label: string;
  labelX: number;
  labelY: number;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SPEEDS = [0.01, 0.1, 1];

const ticksOf = (p: Store['project']) => activeTicks(p.input);
/** Escapement dial radius around a shaft: inside its smallest gear's root, about two modules. */
const dialRadius = (gears: { rootR: number }[], module: number) => Math.min(0.55 * Math.min(...gears.map((g) => g.rootR)), 2.4 * module);
const tickText = (t: number) => `${fmt(t, 3)} tick${t === 1 ? '' : 's'}/s`;
const deg = (r: number) => (r * 180) / Math.PI;
const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Diagram({ store }: { store: Store }) {
  const { project: p, solution: s, selection, select } = store;
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [mult, setMult] = useState(1);
  const [labels, setLabels] = useState(true);
  const groups = useRef(new Map<string, SVGGElement>());
  const time = useRef(0);
  const svg = useRef<SVGSVGElement>(null);

  const parts = useMemo<Drawn[]>(() => {
    if (!s.laidOut) return [];
    const out: Drawn[] = [];
    // Racks first (underneath), then gears largest to smallest, so small gears are never hidden.
    const bySize = [...s.gears].sort((a, b) => b.pitchR - a.pitchR);
    for (const g of bySize) {
      const r = partProfile(p, s, g.id, { kerf: false, zeroPhase: true });
      if (!r.ok) continue;
      const rpm = g.rpm;
      out.push({
        id: g.id,
        kind: 'gear',
        d: profileToPath(r.profile),
        x: g.x,
        y: g.y,
        angle: g.phase,
        speed: rpm === undefined ? undefined : (rpm * 2 * Math.PI) / 60,
        pitchR: g.pitchR,
        rackPitch: 0,
        rackLength: 0,
        state: rpm === undefined ? 'idle' : rpm > 1e-9 ? 'ccw' : rpm < -1e-9 ? 'cw' : 'stopped',
        label: rpm === undefined ? g.id : `${g.id}  ${fmt(rpm, 1)} rpm`,
        labelX: g.x,
        labelY: g.y,
      });
    }
    for (const rs of s.racks) {
      const r = partProfile(p, s, rs.id, { kerf: false });
      if (!r.ok) continue;
      const v = rs.mmPerSec;
      const below = { x: Math.sin(rs.angle) * 3 * s.module, y: -Math.cos(rs.angle) * 3 * s.module };
      out.push({
        id: rs.id,
        kind: 'rack',
        d: profileToPath(r.profile),
        x: rs.origin.x,
        y: rs.origin.y,
        angle: rs.angle,
        speed: v,
        pitchR: 0,
        rackPitch: rs.pitch,
        rackLength: rs.length,
        state: v === undefined ? 'idle' : Math.abs(v) < 1e-9 ? 'stopped' : v > 0 ? 'ccw' : 'cw',
        label:
          v === undefined
            ? rs.id
            : `${rs.id}  ${fmt(v, 1)} mm/s${p.input.kind === 'rack' && p.input.rackId === rs.id && ticksOf(p) ? `, ${tickText(ticksOf(p)!)}` : ''}`,
        labelX: rs.origin.x + below.x,
        labelY: rs.origin.y + below.y,
      });
    }
    return [...out.filter((d) => d.kind === 'rack'), ...out.filter((d) => d.kind === 'gear')];
  }, [p, s]);

  const bounds = useMemo<View>(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of parts) {
      const r = d.kind === 'gear' ? d.pitchR + 2 * s.module : d.rackLength / 2 + 2 * s.module;
      minX = Math.min(minX, d.x - r);
      maxX = Math.max(maxX, d.x + r);
      minY = Math.min(minY, d.y - r);
      maxY = Math.max(maxY, d.y + r);
    }
    if (!Number.isFinite(minX)) return { x: -50, y: -50, w: 100, h: 100 };
    const pad = Math.max(5, 0.08 * Math.max(maxX - minX, maxY - minY));
    return { x: minX - pad, y: -(maxY + pad), w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
  }, [parts, s.module]);

  const [view, setView] = useState<View>(bounds);
  const fitKey = parts.map((d) => d.id).join('|');
  useEffect(() => setView(bounds), [fitKey]); // refit when parts are added/removed, not on every edit

  // A driven rack can only slide so far, so such trains swing back and forth instead of wrapping.
  const travel = useMemo(
    () =>
      rackTravelSeconds(
        s.racks.flatMap((r) => {
          const contacts = s.meshes.filter((m) => m.b === r.id && m.contactX !== undefined).map((m) => Math.abs(m.contactX!));
          return r.mmPerSec === undefined ? [] : [{ length: r.length, pitch: r.pitch, contactX: Math.max(0, ...contacts), mmPerSec: r.mmPerSec }];
        }),
      ),
    [s],
  );
  const transformFor = (d: Drawn, elapsed: number) => {
    // An escapement steps the whole train together, so step time before any rack swing.
    const t = animationClock(steppedTime(elapsed, p.input.ticksPerSec), travel);
    if (d.kind === 'gear') return `translate(${d.x} ${d.y}) rotate(${deg(d.angle + (d.speed ?? 0) * t)})`;
    return `translate(${d.x} ${d.y}) rotate(${deg(d.angle)}) translate(${(d.speed ?? 0) * t} 0)`;
  };

  useEffect(() => {
    if (!playing || typeof requestAnimationFrame === 'undefined') return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      time.current += ((now - last) / 1000) * mult;
      last = now;
      for (const d of parts) groups.current.get(d.id)?.setAttribute('transform', transformFor(d, time.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, mult, parts, travel, p.input.ticksPerSec]);

  // pan & zoom
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const toUser = (clientX: number, clientY: number) => {
    const el = svg.current;
    const rect = el?.getBoundingClientRect();
    if (!el || !rect || rect.width === 0) return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    const scale = Math.max(view.w / rect.width, view.h / rect.height);
    const ox = view.x + view.w / 2 - (rect.width * scale) / 2;
    const oy = view.y + view.h / 2 - (rect.height * scale) / 2;
    return { x: ox + (clientX - rect.left) * scale, y: oy + (clientY - rect.top) * scale, scale };
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.0015);
    const c = toUser(e.clientX, e.clientY);
    setView((v) => ({ x: c.x - (c.x - v.x) * k, y: c.y - (c.y - v.y) * k, w: v.w * k, h: v.h * k }));
  };
  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('[data-part]')) return;
    drag.current = { x: e.clientX, y: e.clientY, view };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const start = drag.current;
    if (!start) return;
    const scale = (toUser(0, 0).scale as number | undefined) ?? 1;
    setView({ ...start.view, x: start.view.x - (e.clientX - start.x) * scale, y: start.view.y - (e.clientY - start.y) * scale });
  };
  const onPointerUp = () => (drag.current = null);

  // Shaft id and speed below each hub; each gear's id above the hub, in the ring only that gear
  // covers (compound gears share a center, so smallest gear innermost); racks below their teeth.
  // `dy` is in em so the lines stay apart at any zoom.
  const textLabels = useMemo(() => {
    const out: { key: string; text: string; x: number; y: number; dy?: string; kind: 'part' | 'shaft' | 'speed' }[] = [];
    for (const sh of s.shafts) {
      const gears = s.gears.filter((g) => g.shaftId === sh.id).sort((a, b) => a.pitchR - b.pitchR);
      if (!gears.length) continue;
      const ticks = p.input.kind === 'shaft' && p.input.shaftId === sh.id ? ticksOf(p) : undefined;
      const speed = sh.rpm === undefined ? 'not driven' : `${fmt(sh.rpm, 1)} rpm${ticks ? `, ${tickText(ticks)}` : ''}`;
      // start below the escapement dial when this shaft carries one
      const below = sh.y - (ticks ? dialRadius(gears, s.module) : 0);
      out.push({ key: `${sh.id}:id`, text: sh.id, x: sh.x, y: below, dy: '1.1em', kind: 'shaft' });
      out.push({ key: `${sh.id}:speed`, text: speed, x: sh.x, y: below, dy: '2.2em', kind: 'speed' });
      let inner = 0;
      for (const g of gears) {
        out.push({ key: g.id, text: g.id, x: sh.x, y: sh.y + (inner + g.rootR) / 2, kind: 'part' });
        inner = Math.max(inner, g.outerR);
      }
    }
    for (const d of parts) if (d.kind === 'rack') out.push({ key: d.id, text: d.label, x: d.labelX, y: d.labelY, kind: 'part' });
    return out;
  }, [s, parts, p]);

  // A small clock dial around the part carrying the escapement (the input).
  const escapement = useMemo(() => {
    const ticks = ticksOf(p);
    if (!ticks) return undefined;
    if (p.input.kind === 'shaft') {
      const id = p.input.shaftId;
      const sh = s.shafts.find((x) => x.id === id);
      const gears = s.gears.filter((g) => g.shaftId === id);
      if (!sh || !gears.length) return undefined;
      return { id, x: sh.x, y: sh.y, r: dialRadius(gears, s.module), ticks };
    }
    const id = p.input.rackId;
    const rs = s.racks.find((x) => x.id === id);
    return rs ? { id, x: rs.origin.x, y: rs.origin.y, r: 2.4 * s.module, ticks } : undefined;
  }, [p, s]);

  const grid = Math.pow(10, Math.floor(Math.log10(Math.max(view.w, view.h) / 20)));
  const partners = (id: string) => p.meshes.filter((m) => m.a === id || m.b === id).map((m) => (m.a === id ? m.b : m.a));

  if (!s.laidOut) {
    return (
      <div class="diagram empty-state">
        <p>Fix the errors under Problems to see the layout.</p>
      </div>
    );
  }

  return (
    <div class="diagram">
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Gear train layout"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="grid-minor" width={grid} height={grid} patternUnits="userSpaceOnUse">
            <path d={`M${grid} 0H0V${grid}`} class="grid-minor" />
          </pattern>
          <pattern id="grid-major" width={grid * 10} height={grid * 10} patternUnits="userSpaceOnUse">
            <rect width={grid * 10} height={grid * 10} fill="url(#grid-minor)" />
            <path d={`M${grid * 10} 0H0V${grid * 10}`} class="grid-major" />
          </pattern>
        </defs>
        <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="url(#grid-major)" />
        <g transform="scale(1,-1)">
          {parts.map((d) => (
            <g
              key={d.id}
              ref={(el) => {
                if (el) groups.current.set(d.id, el);
                else groups.current.delete(d.id);
              }}
              transform={transformFor(d, time.current)}
            >
              <path
                data-part={d.id}
                d={d.d}
                class={`part ${d.state} ${selection.includes(d.id) ? 'selected' : ''}`}
                onClick={() => select([d.id, ...partners(d.id)])}
              >
                <title>{d.label}</title>
              </path>
              {d.kind === 'gear' ? (
                <circle r={d.pitchR} class="pitch" />
              ) : (
                <line x1={-d.rackLength / 2} x2={d.rackLength / 2} y1={0} y2={0} class="pitch" />
              )}
            </g>
          ))}
          {s.shafts.map((sh) => (
            <circle cx={sh.x} cy={sh.y} r={Math.max(0.4, s.module * 0.35)} class="shaft-mark" />
          ))}
          {escapement && (
            <g class="escapement-mark" data-part={escapement.id} transform={`translate(${escapement.x} ${escapement.y})`} style={{ strokeWidth: escapement.r * 0.14 }}>
              <title>{`Escapement: ${tickText(escapement.ticks)}`}</title>
              <circle r={escapement.r} />
              {Array.from({ length: 12 }, (_, i) => {
                const a = (i * Math.PI) / 6;
                const r0 = escapement.r * (i % 3 === 0 ? 0.55 : 0.72);
                return <line x1={r0 * Math.cos(a)} y1={r0 * Math.sin(a)} x2={escapement.r * Math.cos(a)} y2={escapement.r * Math.sin(a)} />;
              })}
            </g>
          )}
        </g>
        {labels &&
          textLabels.map((l) => (
            <text key={l.key} x={l.x} y={-l.y} dy={l.dy} class={`part-label ${l.kind}`} style={{ fontSize: `${Math.max(view.w, view.h) / 50}px` }}>
              {l.text}
            </text>
          ))}
      </svg>
      <div class="diagram-controls">
        <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={playing}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <label>
          Playback
          <select value={String(mult)} onChange={(e) => setMult(Number((e.target as HTMLSelectElement).value))}>
            {SPEEDS.map((x) => (
              <option value={String(x)}>{x === 1 ? 'real time' : `${x}× speed`}</option>
            ))}
          </select>
        </label>
        <label class="check">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels((e.target as HTMLInputElement).checked)} />
          Labels
        </label>
        <button type="button" onClick={() => setView(bounds)}>
          Fit to view
        </button>
        <span class="legend">
          <i class="swatch ccw" /> counter-clockwise <i class="swatch cw" /> clockwise <i class="swatch idle" /> not driven
        </span>
      </div>
    </div>
  );
}
