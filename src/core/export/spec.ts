// Printable HTML spec sheet and a static layout SVG.
import { partProfile } from '../geometry/parts';
import { transformProfile } from '../geometry/sample';
import { profileToPath } from '../geometry/svgpath';
import type { Bore, Project } from '../model';
import type { Solution } from '../solver';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const fmt = (x: number | undefined, digits = 3): string => {
  if (x === undefined || !Number.isFinite(x)) return '—';
  const s = x.toFixed(digits).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

export function boreText(b: Bore): string {
  switch (b.kind) {
    case 'round':
      return `round Ø${fmt(b.dia)}`;
    case 'dflat':
      return `D-flat Ø${fmt(b.dia)}, flat ${fmt(b.flatDepth)}`;
    case 'hex':
      return `hex ${fmt(b.acrossFlats)} A/F`;
    case 'square':
      return `square ${fmt(b.side)}`;
  }
}

/** Static SVG of the assembled train (nominal geometry, solved phases). */
export function layoutSvg(p: Project, s: Solution): string {
  const paths: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number, r: number) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  };
  const labels: string[] = [];
  for (const g of s.gears) {
    const r = partProfile(p, s, g.id, { kerf: false });
    if (!r.ok) continue;
    paths.push(`<path d="${profileToPath(transformProfile(r.profile, 0, g.x, g.y))}" class="part"/>`);
    paths.push(`<circle cx="${fmt(g.x)}" cy="${fmt(g.y)}" r="${fmt(g.pitchR)}" class="pitch"/>`);
    grow(g.x, g.y, g.outerR);
    labels.push(`<text x="${fmt(g.x)}" y="${fmt(-g.y)}" class="label">${esc(g.id)}</text>`);
  }
  for (const rs of s.racks) {
    const r = partProfile(p, s, rs.id, { kerf: false });
    if (!r.ok) continue;
    paths.push(`<path d="${profileToPath(transformProfile(r.profile, rs.angle, rs.origin.x, rs.origin.y))}" class="part"/>`);
    grow(rs.origin.x, rs.origin.y, rs.length / 2 + 10 * s.module);
    labels.push(`<text x="${fmt(rs.origin.x)}" y="${fmt(-rs.origin.y)}" class="label">${esc(rs.id)}</text>`);
  }
  for (const sh of s.shafts) paths.push(`<circle cx="${fmt(sh.x)}" cy="${fmt(sh.y)}" r="${fmt(s.module * 0.6)}" class="shaft"/>`);
  if (!Number.isFinite(minX)) {
    minX = minY = -10;
    maxX = maxY = 10;
  }
  const pad = 5 * (s.module || 1);
  const vb = [minX - pad, -(maxY + pad), maxX - minX + 2 * pad, maxY - minY + 2 * pad].map((x) => fmt(x)).join(' ');
  const fontSize = fmt(Math.max(2, (s.module || 1) * 2.5));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="layout">
<style>.part{fill:#d7dde4;stroke:#334;stroke-width:0.15;fill-rule:evenodd}.pitch{fill:none;stroke:#889;stroke-width:0.1;stroke-dasharray:1 0.6}.shaft{fill:#c33}.label{font:${fontSize}px sans-serif;fill:#123;text-anchor:middle;dominant-baseline:middle}</style>
<g transform="scale(1,-1)">${paths.join('')}</g>${labels.join('')}
</svg>`;
}

export function specHtml(p: Project, s: Solution, version: string): string {
  const input =
    p.input.kind === 'shaft' ? `${esc(p.input.shaftId)} at ${fmt(p.input.rpm)} rpm` : `${esc(p.input.rackId)} at ${fmt(p.input.mmPerSec)} mm/s`;
  const pitch = p.pitch.system === 'module' ? `module ${fmt(p.pitch.value, 4)}` : `${fmt(p.pitch.value, 4)} DP (module ${fmt(s.module, 4)})`;
  const shaftRows = p.shafts
    .map((sh) => {
      const ss = s.shafts.find((x) => x.id === sh.id)!;
      return `<tr><td>${esc(sh.id)}</td><td>${esc(sh.name)}</td><td>${fmt(ss.x)}</td><td>${fmt(ss.y)}</td><td>${fmt(ss.rpm)}</td><td>${ss.dir ?? '—'}</td><td>${fmt(ss.torqueRatio)}</td><td>${esc(boreText(sh.bore))}</td></tr>`;
    })
    .join('');
  const gearRows = p.gears
    .map((g) => {
      const gs = s.gears.find((x) => x.id === g.id)!;
      return `<tr><td>${esc(g.id)}</td><td>${esc(g.name)}</td><td>${esc(g.shaftId)}</td><td>${g.teeth}</td><td>${fmt(gs.pitchR * 2)}</td><td>${fmt(gs.outerR * 2)}</td><td>${fmt(gs.rootR * 2)}</td><td>${fmt(g.faceWidth)}</td><td>${fmt(g.zOffset)}</td><td>${fmt((gs.phase * 180) / Math.PI)}</td><td>${fmt(gs.rpm)}</td><td>${fmt(gs.surfaceSpeed)}</td></tr>`;
    })
    .join('');
  const rackRows = p.racks
    .map((r) => {
      const rs = s.racks.find((x) => x.id === r.id)!;
      return `<tr><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${r.teeth}</td><td>${fmt(rs.length)}</td><td>${fmt(r.faceWidth)}</td><td>${fmt(r.backHeight)}</td><td>${fmt(rs.origin.x)}, ${fmt(rs.origin.y)}</td><td>${fmt((rs.angle * 180) / Math.PI)}</td><td>${fmt(rs.mmPerSec)}</td></tr>`;
    })
    .join('');
  const meshRows = s.meshes
    .map(
      (m) =>
        `<tr><td>${esc(m.a)}</td><td>${esc(m.b)}</td><td>${m.centerDist.toFixed(3)}</td><td>${Number.isFinite(m.ratio) ? fmt(m.ratio, 4) : 'rack'}</td><td>${fmt(m.contactRatio, 2)}</td></tr>`,
    )
    .join('');
  const issues = s.issues.length
    ? `<ul>${s.issues.map((i) => `<li class="${i.severity}">${i.severity === 'error' ? '✖' : '⚠'} ${esc(i.message)}</li>`).join('')}</ul>`
    : '<p>None.</p>';
  const fit = p.fit;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(p.name)} — gear train spec</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:2rem;color:#111;background:#fff}
h1{font-size:1.4rem;margin:0 0 .25rem}h2{font-size:1.1rem;margin:1.5rem 0 .5rem}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{border:1px solid #ccc;padding:.25rem .5rem;text-align:left}th{background:#f2f2f2}
.layout{width:100%;max-height:60vh;border:1px solid #ddd}.meta{color:#555}
li.error{color:#a00}li.warning{color:#850}
@media print{body{margin:1cm}.layout{max-height:none}}
</style></head><body>
<h1>${esc(p.name)}</h1>
<p class="meta">Generated by GearGoober ${esc(version)} · all lengths in mm · angles in degrees · +rpm = counter-clockwise viewed from +z</p>
<h2>Summary</h2>
<table><tbody>
<tr><th>Input</th><td>${input}</td></tr>
<tr><th>Pitch</th><td>${pitch}, pressure angle ${fmt(p.pressureAngleDeg)}°</td></tr>
<tr><th>Fit</th><td>backlash ${fmt(fit.backlashMm)}, clearance ${fmt(fit.clearanceCoef)}·m, kerf ${fmt(fit.kerfMm)}, bore corner relief ${fmt(fit.cornerReliefMm)}</td></tr>
</tbody></table>
<h2>Layout</h2>
${layoutSvg(p, s)}
<h2>Shafts</h2>
<table><thead><tr><th>id</th><th>name</th><th>x</th><th>y</th><th>rpm</th><th>dir</th><th>torque ×</th><th>bore</th></tr></thead><tbody>${shaftRows}</tbody></table>
<h2>Gears</h2>
<table><thead><tr><th>id</th><th>name</th><th>shaft</th><th>teeth</th><th>pitch Ø</th><th>outer Ø</th><th>root Ø</th><th>face</th><th>z</th><th>phase°</th><th>rpm</th><th>pitch speed mm/s</th></tr></thead><tbody>${gearRows}</tbody></table>
${rackRows ? `<h2>Racks</h2><table><thead><tr><th>id</th><th>name</th><th>teeth</th><th>length</th><th>face</th><th>back</th><th>origin</th><th>angle°</th><th>mm/s</th></tr></thead><tbody>${rackRows}</tbody></table>` : ''}
<h2>Meshes</h2>
<table><thead><tr><th>a</th><th>b</th><th>center distance</th><th>ratio b/a</th><th>contact ratio</th></tr></thead><tbody>${meshRows}</tbody></table>
<h2>Issues</h2>
${issues}
</body></html>
`;
}
