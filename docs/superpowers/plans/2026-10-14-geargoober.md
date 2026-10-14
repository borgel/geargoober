# GearGoober Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file, offline, browser-based spur gear + rack train designer with speed solving, animated visualization, and DXF / STEP / Fusion 360 / spec-sheet export.

**Architecture:** Pure TypeScript domain core (`src/core/`: model, text format, solver, exact 2D geometry, exporters) with no DOM dependencies, tested with Vitest in Node. Thin Preact UI (`src/ui/`) renders the editor, SVG diagram and export dialog. Vite + `vite-plugin-singlefile` inlines everything into `dist/geargoober.html`. All tooling runs in Docker through the `./gg` wrapper.

**Tech Stack:** TypeScript, Vite, vite-plugin-singlefile, Preact, Vitest, fflate (zip), occt-import-js (test-only STEP validation), Python 3 + ezdxf (test-only DXF validation), Docker (node:22-alpine).

**Spec:** `docs/superpowers/specs/2026-10-14-geargoober-design.md`

## Global Constraints

- Output must run from `file://` with no network: one HTML file, no external fetches, no WASM in the shipped bundle.
- All internal lengths are **mm**; angles internally are **radians** (degrees only at the model/text/UI boundary: `pressureAngleDeg`, `angleDeg`, `phaseDeg`).
- DP → module: `m = 25.4 / DP`. Entered pitch system/value preserved.
- Defaults: `pressureAngleDeg 20`, `backlashMm 0.1`, `clearanceCoef 0.25`, `kerfMm 0`, `cornerReliefMm 0.2`.
- Addendum `1.0·m`; dedendum `(1 + clearanceCoef)·m`; root fillet ≈ `0.38·m`; tooth thickness at pitch `π·m/2 − backlash/2`.
- Center distance is theoretical `m·(Za+Zb)/2` (backlash only in tooth thickness).
- Spline fit tolerance **≤ 0.001 mm**.
- Kerf: outer offset outward `kerf/2`, holes inward `kerf/2`; per-export option, default on for DXF, off for STEP.
- Positive rpm = CCW viewed from +z. Rack `mmPerSec` positive = along rack local +x.
- DXF: AC1015 ASCII, `$INSUNITS 4`, `$MEASUREMENT 1`, layers `PROFILE`, `BORE`, `PITCH_CIRCLE`, `CENTER` (+ layout layers).
- STEP: AP214, one `MANIFOLD_SOLID_BREP` per part, bottom at z = 0, height `faceWidth`.
- Fusion parameter names: `gt_module`, `gt_pa`, `<Shaft>_x`, `<Shaft>_y`, `cd_<A>_<B>`, `<Gear>_face` (ids sanitized to `[A-Za-z0-9_]`). Fusion API lengths are **cm**.
- Undercut warning thresholds: Z < 17 at 20°, Z < 32 at 14.5°. Contact ratio warning < 1.2. Position conflict tolerance 0.01 mm.
- Core never throws for user-caused problems (solver → issues; parser → `{ok:false, errors}`).

## Review Focus

1. **Degenerate numbers** (teeth 0/3/non-integer, module ≤ 0, face width ≤ 0, bore ≤ 0, NaN from a blank UI field) → solver reports an error naming the part; geometry/exports are never attempted; UI does not crash. *Test: solver.test.ts "rejects degenerate numeric values".*
2. **Very low tooth counts (Z = 5–8)** where tooth tips become pointed or fillets don't fit → geometry still returns a closed, valid profile (tip land clamped, fillet shrunk) plus a pointed-tooth warning. *Test: spur.test.ts "low tooth counts still produce closed profiles".*
3. **Disconnected sub-trains** (two groups of gears not linked by any mesh) → second group is laid out beside the first rather than on top of it, flagged unreachable, still exportable. *Test: solver.test.ts "lays out disconnected components side by side".*
4. **Messy text input** (CRLF line endings, tabs, trailing comments, unknown keyword, duplicate ids, quoted names with spaces) → parses or yields line/col errors; never throws. *Test: gearText.test.ts "tolerates CRLF, tabs and comments" + "duplicate ids".*
5. **Kerf larger than a concave fillet can absorb** (e.g. m = 0.3, kerf 0.3) → offset reports a clear error surfaced in the export dialog instead of producing self-intersecting geometry. *Test: offset.test.ts "rejects kerf larger than concave radius".*

---

## File Map

```
gg                              # docker wrapper (dev/test/build/shell/npm)
Dockerfile                      # node:22-alpine + python3 + ezdxf
package.json, tsconfig.json, vite.config.ts, index.html
src/main.tsx                    # mounts <App/>
src/core/model.ts               # Project/Bore/Gear/... types, defaults, newProject()
src/core/units.ts               # moduleOf(project), DEG, RAD
src/core/vec.ts                 # Vec2 helpers
src/core/format/gearText.ts     # parseGear(text) / serializeGear(project)
src/core/format/json.ts         # toJson / fromJson
src/core/solver.ts              # solve(project): Solution
src/core/geometry/types.ts      # Segment, Loop, Profile
src/core/geometry/bezier.ts     # evaluate, fitHermite(f, u0, u1, tol)
src/core/geometry/involute.ts   # inv(), toothFlank functions
src/core/geometry/spur.ts       # spurProfile(params)
src/core/geometry/rack.ts       # rackProfile(params)
src/core/geometry/bore.ts       # boreLoop(bore, shrink, relief)
src/core/geometry/offset.ts     # offsetLoop(loop, d)
src/core/geometry/sample.ts     # sampleLoop, loopArea, transform, pointInLoop
src/core/geometry/parts.ts      # partProfile(project, solution, id, {kerf, zeroPhase})
src/core/export/dxf.ts          # DxfWriter, partDxf, layoutDxf
src/core/export/step.ts         # partStep
src/core/export/fusion.ts       # fusionScript
src/core/export/spec.ts         # specHtml, layoutSvg
src/core/export/csv.ts          # gearsCsv
src/core/export/bundle.ts       # exportBundle → {name, data}[] ; zip via fflate
src/core/example.ts             # EXAMPLE_GEAR text
src/ui/App.tsx, ui/state.ts, ui/ProjectPanel.tsx, ui/ListEditor.tsx,
src/ui/TextEditor.tsx, ui/Diagram.tsx, ui/IssuesPanel.tsx,
src/ui/ResultsPanel.tsx, ui/ExportDialog.tsx, ui/download.ts, ui/styles.css
test/**                         # mirrors src/core; test/helpers/*.ts
```

---

### Task 1: Containerized tooling + scaffold

**Files:** Create `Dockerfile`, `gg`, `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `test/smoke.test.ts`, `.gitignore`, `.dockerignore`.

**Interfaces:** Produces `./gg {dev|test|build|shell|npm|run}`.

- [ ] Dockerfile: `FROM node:22-alpine`, `apk add python3 py3-pip bash`, `pip install --break-system-packages ezdxf`, `WORKDIR /app`.
- [ ] `gg`: bash, `set -euo pipefail`, cd to script dir, `docker build -q -t geargoober-dev .`, run with `-v "$PWD:/app" -v geargoober_node_modules:/app/node_modules`, `-it` only if stdin is a TTY. Before each command ensure deps: compare `sha256sum package-lock.json` with `node_modules/.lockhash`; run `npm ci` (or `npm install` if no lockfile) on mismatch. `dev` adds `-p 5173:5173` and runs `vite --host 0.0.0.0`. `test` → `npx vitest run "$@"` (or `vitest` with `--watch`). `build` → `npx vite build`. `npm ...` passthrough, `run ...` arbitrary command, `shell` → `bash`.
- [ ] `npm install` vite, vitest, typescript, preact, @preact/preset-vite, vite-plugin-singlefile, fflate, occt-import-js, jsdom, @testing-library/preact (latest; lockfile pins).
- [ ] vite.config: plugins `[preact(), viteSingleFile()]`, `build.outDir 'dist'`, rename output to `geargoober.html` (rollup `input: index.html`, then post-build rename via a tiny plugin `closeBundle` hook or `build.rollupOptions.output` — use a plugin that renames `dist/index.html`).
- [ ] vitest config inside vite.config: `test.environment 'node'`, `include ['test/**/*.test.ts?(x)']`.
- [ ] Smoke test `expect(1+1).toBe(2)`; `./gg test` passes; `./gg build` emits `dist/geargoober.html`.
- [ ] Commit `chore: containerized Vite/Preact/Vitest scaffold`.

### Task 2: Model + units

**Files:** `src/core/model.ts`, `src/core/units.ts`, `src/core/vec.ts`; test `test/core/units.test.ts`.

**Produces:**
```ts
type Bore = {kind:'round';dia:number}|{kind:'dflat';dia:number;flatDepth:number}|{kind:'hex';acrossFlats:number}|{kind:'square';side:number};
interface Shaft {id:string;name:string;bore:Bore}
interface Gear {id:string;name:string;shaftId:string;teeth:number;faceWidth:number;zOffset:number}
interface Rack {id:string;name:string;teeth:number;faceWidth:number;backHeight:number}
interface Mesh {a:string;b:string;angleDeg:number;offset?:number}   // offset: contact x along rack when a gear is placed FROM a rack
type Input = {kind:'shaft';shaftId:string;rpm:number}|{kind:'rack';rackId:string;mmPerSec:number};
interface Fit {backlashMm:number;clearanceCoef:number;kerfMm:number;cornerReliefMm:number}
interface ExportPrefs {kerfDxf:boolean;kerfStep:boolean}
interface Project {name;pitch:{system:'module'|'dp';value};pressureAngleDeg:number;fit:Fit;input:Input;shafts;gears;racks;meshes;exportPrefs:ExportPrefs}
DEFAULT_FIT, newProject(): Project, boreRadius(bore): number  // max extent from center
moduleOf(p): number; DEG=Math.PI/180
Vec2 = {x,y}; v(x,y), add, sub, scale, len, rot(p,ang), dot, cross, polar(r,ang)
```
- [ ] Tests: `moduleOf` for module 1.5 → 1.5; DP 24 → 25.4/24; DP 0 → NaN (solver handles).
- [ ] Implement, pass, commit `feat(core): project model and units`.

### Task 3: `.gear` text format + JSON

**Files:** `src/core/format/gearText.ts`, `src/core/format/json.ts`; tests `test/core/gearText.test.ts`, `test/core/json.test.ts`.

**Produces:** `parseGear(text): {ok:true;project:Project}|{ok:false;errors:{line:number;col:number;message:string}[]}`; `serializeGear(p): string`; `toJson(p, solution?)`, `fromJson(text): ParseResult` (same shape).

Grammar (one statement per line, `#` to EOL comment, tokens split on whitespace, `"..."` strings):
```
project "<name>"
pitch module <m> | pitch dp <dp>
pressure_angle <deg>
fit [backlash n] [clearance n] [kerf n] [relief n]
input <shaftId> rpm <n> | input <rackId> mmps <n>
shaft <id> [name "<s>"] bore round <d> | bore dflat <d> <depth> | bore hex <af> | bore square <s>
gear <id> [name "<s>"] on <shaftId> teeth <n> width <w> [z <z>]
rack <id> [name "<s>"] teeth <n> width <w> [back <h>]
mesh <a> <b> angle <deg> [offset <mm>]
export [kerf_dxf on|off] [kerf_step on|off]
```
Defaults when omitted: name = id, `z 0`, `back 5` (mm), mesh `offset` undefined (= 0). Input kind decided by unit keyword. Unknown keyword / missing value / non-number → error with line/col, continue parsing other lines. Duplicate ids within shafts+gears+racks → error.

- [ ] Tests: round trip of the spec example (`parse(serialize(parse(x)))` deep-equals `parse(x)`); defaults applied; DP pitch preserved; every bore kind; `input R1 mmps 50` → rack input; CRLF + tabs + trailing comments; unknown keyword error with correct line & col; non-numeric teeth error; duplicate id error; quoted name with spaces; missing `input` → parser leaves `{kind:'shaft',shaftId:'',rpm:0}`; the solver reports "no input".
- [ ] JSON: `fromJson(toJson(p))` equals `p`; invalid JSON → error line 1.
- [ ] Implement, pass, commit `feat(core): .gear text format and JSON io`.

### Task 4: Solver

**Files:** `src/core/solver.ts`, `src/core/gearmath.ts` (`inv(φ)`, `toothTipHalfAngle(m,z,paRad,backlash)`, `contactRatio…` — reused by geometry); test `test/core/solver.test.ts`.

**Consumes:** model, units, vec. **Produces:**
```ts
interface Issue {severity:'error'|'warning';message:string;refs:string[]}
interface ShaftSol {id;x;y;rpm?:number;dir?:'cw'|'ccw'|'stopped';torqueRatio?:number}
interface GearSol {id;shaftId;m;z;pitchR;outerR;rootR;baseR;phase /*rad*/;rpm?;surfaceSpeed?;x;y}
interface RackSol {id;origin:Vec2;angle /*rad of local +x*/;length;pitch;mmPerSec?;minX;maxX}
interface MeshSol {a;b;centerDist;ratio;contactRatio;contactX? /*rack meshes*/}
interface Solution {ok:boolean /*no errors*/;module;pa /*rad*/;shafts:ShaftSol[];gears:GearSol[];racks:RackSol[];meshes:MeshSol[];issues:Issue[]}
solve(p: Project): Solution
```
Algorithm:
1. Validate: module finite > 0; pa ∈ (0, 45°); each gear teeth integer ≥ 4, faceWidth > 0, shaft exists; rack teeth integer ≥ 1, width > 0, back > 0; bore dims > 0 (dflat depth in (0, dia/2)); mesh `a` is a gear, `b` gear or rack, a ≠ b, not same shaft, no duplicate pair; input target exists. Any error → return with `ok:false`, geometry fields still filled where computable (gear radii), positions 0.
2. Radii: `pitchR = m z/2`, `outerR = pitchR + m`, `rootR = pitchR − (1+c)m`, `baseR = pitchR cos α`.
3. Positions + phases (BFS over parts graph: gear–gear and gear–rack edges plus shaft membership). Component roots: first shaft in declaration order not yet placed; root shaft at origin for first component, later components at `x = prevMaxX + gap` (gap = 10·m, extents from outer radii/rack bounds), `y = 0`. Gear on placed shaft gets shaft position; first gear of a component gets phase 0; other gears on a shaft whose phase is not yet fixed get 0 unless set by mesh. Mesh A→B (β = angleDeg): `cd = m(zA+zB)/2`; B's shaft at `A + polar(cd, β)`. Phase rule: `fA = frac((β − φA)/(2π/zA))`, `fB = 0.5 − fA`, `φB = β + π − fB·2π/zB`. Rack from gear G: `u = polar(1,β)`, rack local +x `t = rot(u, +90°)`, rack angle = β + 90°, local +y = −u; `p = πm`; tooth k center at local `xk = (k − (N−1)/2)·p`, gap centers at `xk + p/2`. Contact point world `C = G + rG·u`. G's tooth center lies at tangential offset `−fG·p` from C, and a rack gap must be there, so `contactX = xg + fG·p` for some gap center xg; pick the gap minimizing |contactX|. `origin = C − contactX·t`. Gear placed FROM a rack (mesh.offset = contact x along rack, default 0): `C = origin + offset·t`, `u = rot(t, −90°)`, gear center `C − rG·u`; mesh angleDeg is not used for placement but checked (warn if it differs from atan2(u) by > 0.01°); rack tooth fraction at contact `fR = frac((offset − x0)/p)`, x0 = tooth-0 center; gear needs `fG = frac(fR + 0.5)` (no direction reversal across a rack); `φG = β − fG·2π/zG` with β = atan2(u). Already-placed both ends → check distance |cd − dist| > 0.01 → error "position conflict"; phase mismatch > 1e-6 tooth → warning "teeth not in phase".
4. Speeds (BFS from input over shafts+racks): gear→gear `ωb = −ωa·za/zb`; shaft→rack `v = ω·rG` (ω rad/s from rpm·2π/60); rack→shaft `ω = v/rG`. Revisit with |Δ| > 1e-9·max(1,|x|) → error "speed conflict". Set dir, torqueRatio = |rpmIn/rpm| (shaft input only, rpm ≠ 0), gear surfaceSpeed = |ω|·pitchR.
5. Mesh results: ratio = zb/za (rack: undefined → mm per rev `2π rG`... store `ratio = NaN` for rack), contact ratio gear–gear `[√(raA²−rbA²)+√(raB²−rbB²)−cd·sinα]/(πm cosα)`, gear–rack `[√(ra²−rb²) − r sinα + m/sinα]/(πm cosα)`.
6. Warnings: undercut (Z < ceil(2/sin²α) → 17 / 32); pointed tooth (tip half-angle `ψ + invα − invφa ≤ 0`, `ψ = (πm/2 − B/2)/(2r)`); contact ratio < 1.2; meshing pair z-ranges disjoint; non-meshing gears on different shafts with overlapping z and center dist < raA + raB; gear outer circle containing another shaft's center (shaft radius from bore) → "G overlaps shaft S"; bore rim `rootR − boreR < m`; rack contact |contactX| > L/2 − p; parts unreachable from input; parts in a component other than the first → warning "not connected to S1 (placed beside)".

- [ ] Tests (each its own `it`): simple pair 20T→40T @1000 rpm → S2 −500 rpm, cd = 30 (m=1), S2 at (30,0); angle 90 → S2 at (0,30); compound 12/48 + 12/48 → 1000→62.5 rpm, sign +; idler 20→30→20 output +1000 (same dir); rack input 50 mm/s, pinion m1 z20 → rpm = 50/10·60/2π; pinion→rack speed; DP project cd uses 25.4/DP; consistent triangle loop no error; inconsistent speed loop → error refs; position conflict loop → error; disconnected component placed beside (x > first comp max) + warning; degenerate values (teeth 3, 12.5, module 0, width 0, NaN) → errors naming ids, no throw; mesh same shaft → error; undercut warnings 16T@20° yes, 17T no, 31T@14.5° yes; contact ratio of 20/40 at 20° ≈ 1.6 (±0.05); bore rim warning; overlapping non-meshing gears warning; gear over another shaft warning; phase rule: for a pair, `fA + fB ≡ 0.5`.
- [ ] Implement, pass, commit `feat(core): train solver for speeds, layout, phases and issues`.

### Task 5: Geometry primitives (Bezier fit, sampling, involute)

**Files:** `src/core/geometry/types.ts`, `bezier.ts`, `sample.ts`, `involute.ts`; tests `test/geometry/bezier.test.ts`, `involute.test.ts`, `sample.test.ts`.

**Produces:**
```ts
type Segment = {kind:'line';a:Vec2;b:Vec2}
  | {kind:'arc';center:Vec2;r:number;start:number;end:number}       // traversed start→end; end>start ⇒ CCW
  | {kind:'bezier';p:[Vec2,Vec2,Vec2,Vec2]};                          // cubic; exported as degree-3 B-spline (knots 0,0,0,0,1,1,1,1)
type Loop = Segment[];  interface Profile {outer:Loop;holes:Loop[]}   // outer CCW, holes CW
segStart(s), segEnd(s), segPoint(s,u), segTangent(s,u)
fitHermite(f:(u)=>Vec2, u0, u1, tol=0.001): bezier Segment[]          // numeric derivative, split at midpoint until max error at 16 interior params ≤ tol
sampleLoop(loop, maxErr=0.005): Vec2[]; loopArea(loop): signed area (sampled, fine); pointInPolygon(pt, poly)
transformProfile(p, {rot, dx, dy}), reverseLoop(loop)
involutePoint(rb, t, rotation): Vec2 // rb(cos t + t sin t, sin t − t cos t) rotated
```
- [ ] Tests: fitHermite on a quarter circle stays within 0.001 mm (check 200 samples vs true radius); involute point radius = rb√(1+t²) and polar angle = t − atan t; arc start/end/point; loopArea of unit square loop = 1, of CW loop = −1; pointInPolygon basics.
- [ ] Implement, pass, commit `feat(geometry): segments, bezier fitting, sampling, involute`.

### Task 6: Spur gear profile

**Files:** `src/core/geometry/spur.ts`; test `test/geometry/spur.test.ts`.

**Produces:** `spurOuterLoop({m, z, paRad, backlash, clearanceCoef}): {loop:Loop; pointed:boolean; filletR:number}`. Tooth 0 centered on +x, CCW loop starting at gap center angle −π/z.

Construction per tooth (local, tooth on +x):
- `r=mz/2, rb=r cosα, ra=r+m, rf=r−(1+c)m`, `ψ = (πm/2 − B/2)/(2r)`.
- Flank half-angle at radius ρ ≥ rb: `θ(ρ) = ψ + inv(α) − inv(acos(rb/ρ))`; via roll t: radius `rb√(1+t²)`, angle `θ = ψ + inv(α) − (t − atan t)`. For ρ < rb (when rf < rb): radial line at angle θ(rb).
- Upper flank point (angle +θ), lower flank mirrored (y → −y).
- Root fillet radius `rfil = 0.38m`; find on the upper flank the param where a circle of radius rfil centered at `P + rfil·N` (N = unit normal pointing into the gap, i.e. toward increasing polar angle) has `|C| = rf + rfil`; bisection over a unified flank param (radial part then involute part). If no solution or fillet tangent angle on root circle exceeds gap center π/z, shrink `rfil *= 0.8` (≤ 20 tries; final fallback rfil = 0 → sharp corner at rf where the radial/involute meets root circle; if flank starts above rf, add radial line down to rf).
- Tip: if `θ(ra) ≤ 0` → pointed: find ra' where θ = 0 (bisection), tip land degenerates; flag `pointed`.
- Loop per tooth k (rotate by k·2π/z): root arc (rf, from −π/z to lower fillet root tangent angle) → lower fillet arc → lower radial line (if any) → lower involute beziers (fitHermite over t) → tip arc (ra, −θa → +θa, skipped if pointed) → upper involute (reversed) → upper radial line → upper fillet → root arc to +π/z. Merge consecutive root arcs across teeth is optional (keep separate).
- [ ] Tests: loop closed & continuous (every segEnd ≈ next segStart within 1e-9); loop area positive and between π·rf² and π·ra²; tooth thickness at pitch: intersect sampled profile with circle r on tooth 0 → arc length = πm/2 − B/2 (±0.002); all involute beziers within 0.001 mm of analytic involute (sample t, compute polar radius/angle error); tangent continuity at fillet joins (angle < 1e-4 rad); low tooth counts z = 5,6,7,8 closed, area > 0, `pointed` reported where expected (consistent with `toothTipHalfAngle()` from `src/core/gearmath.ts` ≤ 0); z = 200 works (≤ 1 s).
- [ ] Implement, pass, commit `feat(geometry): involute spur gear profile with root fillets`.

### Task 7: Rack + bores + part assembly

**Files:** `src/core/geometry/rack.ts`, `bore.ts`, `parts.ts`; tests `test/geometry/rack.test.ts`, `bore.test.ts`, `parts.test.ts`.

**Produces:**
- `rackOuterLoop({m, n, paRad, backlash, clearanceCoef, backHeight}): Loop` — local frame: pitch line y = 0, teeth toward +y, tooth k center `x = (k − (n−1)/2)πm`, ends at half-gaps x = ±nπm/2 on the root line, back bottom at `y = −(1+c)m − backHeight`. Flank half-width at height y: `s/2 − y·tanα`, `s = πm/2 − B/2`. Root fillets radius `0.38m` tangent to root line and flank (shrink if they collide with neighbors). CCW.
- `boreLoop(bore, {shrink=0, relief}): Loop` — CW. round: two semicircle arcs r = dia/2 − shrink. dflat: circle R = dia/2 − shrink, flat chord at y = R − flatDepth (flatDepth unchanged by shrink), arc long way + line. hex: across flats `af − 2·shrink`, vertex circumradius `af'/√3`, flats parallel to x (vertices at 0°,60°…); square side `s − 2·shrink`; polygon corners filleted with `max(relief − shrink, 0)`… note shrinking a hole's corner fillet: a parallel inward offset of a convex rounded polygon reduces fillet radius by shrink; fillet `max(relief − shrink, 0)` (0 → sharp).
- `partProfile(project, solution, partId, {kerf:boolean, zeroPhase?:boolean}): {profile:Profile; kind:'gear'|'rack'} | {error:string}` — gear: spur outer rotated by phase (unless zeroPhase) + shaft bore hole; rack: rack loop, no holes; kerf → `offsetLoop(outer, +kerf/2)` and bore `shrink = kerf/2`.
- [ ] Tests: rack closed, CCW area = n·πm·(hTeethAvg…) → just check area within bounds and closed; rack tooth thickness at y = 0 equals s; each bore kind closed, CW (negative area), round area ≈ π r², hex area ≈ (√3/2)·af² minus small fillet loss, shrink reduces af by 2·shrink; dflat area < circle area; partProfile gear has 1 hole.
- [ ] **Mesh fit test** (`test/geometry/meshfit.test.ts`): gears z=12 and z=31, m=1, B=0.1, positioned/phased by `solve()`; sample both profiles (maxErr 0.002) only within 3m of the pitch point; no point of B inside A polygon and vice versa at the solved phase; rotate B by ±δ (bisection) to first contact holding A fixed → circumferential backlash at the pitch circle equals B (each tooth thinned B/2): assert `δtot·rB` within [0.8B, 1.2B]. Repeat for gear + rack (rack translated instead of rotated). Repeat after rotating A by 0.3 tooth and B by kinematic ratio (still no overlap).
- [ ] Implement, pass, commit `feat(geometry): rack, bores, part profiles; mesh fit verified`.

### Task 8: Kerf offset

**Files:** `src/core/geometry/offset.ts`; test `test/geometry/offset.test.ts`.

**Produces:** `offsetLoop(loop, d): {ok:true;loop:Loop}|{ok:false;error:string}` — offsets to the RIGHT of travel direction by d (outward for a CCW outer loop). Lines shift by right normal; arcs: CCW → r + d, CW → r − d (if ≤ 1e-6 → error "kerf too large for radius r"); beziers: `fitHermite(u ↦ P(u) + d·rightNormal(u))`. Joins: if end tangent of seg i ≈ start tangent of seg i+1 (< 1e-6 rad) connect directly; else if the turn is convex w.r.t. offset side (cross(t_end, t_start) > 0 for right-side offset on a CCW loop… compute: gap appears when turning left) insert an arc around the original corner of radius d; concave non-tangent corner → error "unsupported concave corner" (our profiles never produce these).
- [ ] Tests: square loop (CCW, 10×10) offset 1 → area 144 − (4 − π)·1 = 140 + π; circle (two arcs) offset 0.5 → radius +0.5; spur gear offset 0.075 → closed, area increases ≈ perimeter·d (±5%); all sampled points of offset gear at distance ≈ d from original sampled polygon (±0.002); kerf larger than fillet (m 0.3, d 0.15) → `ok:false` with message.
- [ ] Implement, pass, commit `feat(geometry): kerf offset`.

### Task 9: DXF export

**Files:** `src/core/export/dxf.ts`; tests `test/export/dxf.test.ts`, helper `test/helpers/python.ts` (spawnSync python3).

**Produces:** `partDxf(project, solution, partId, {kerf}): string`; `layoutDxf(project, solution, {kerf}): string`; internal `DxfWriter` building a minimal valid R2000 file: HEADER (`$ACADVER AC1015`, `$HANDSEED`, `$INSUNITS 4`, `$MEASUREMENT 1`), TABLES (VPORT, LTYPE [ByBlock, ByLayer, Continuous, DASHED], LAYER, STYLE [Standard], VIEW, UCS, APPID [ACAD], DIMSTYLE [Standard], BLOCK_RECORD [*Model_Space, *Paper_Space]), BLOCKS (*Model_Space, *Paper_Space), ENTITIES (LINE, ARC [CCW only — CW arcs written with swapped start/end], CIRCLE, SPLINE [degree 3, 8 knots, 4 control points], POINT, TEXT), OBJECTS (root dictionary + ACAD_GROUP). Every object gets a handle and owner (330) pointers; subclass markers (100).
Layers: part files `PROFILE`, `BORE`, `PITCH_CIRCLE` (DASHED linetype), `CENTER`; layout adds `SHAFTS`, `DIMENSIONS` (lines + TEXT labels "cd 30.000"), `LABELS` (part ids).
- [ ] Tests: header contains `AC1015` and `$INSUNITS\n70\n4`; contains SPLINE and ARC entities; layer names present; **ezdxf audit**: python `ezdxf.readfile(path); auditor = doc.audit(); assert not auditor.has_errors`, entity count by type matches profile segments; ezdxf `doc.units == 4`; layout DXF passes audit and has one POINT per shaft.
- [ ] Implement, pass, commit `feat(export): R2000 DXF for parts and layout`.

### Task 10: STEP export

**Files:** `src/core/export/step.ts`; tests `test/export/step.test.ts`.

**Produces:** `partStep(project, solution, partId, {kerf}): string`. Hand-written ISO-10303-21 AP214 (`FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'))`), mm units context, product structure, `ADVANCED_BREP_SHAPE_REPRESENTATION` with one `MANIFOLD_SOLID_BREP(CLOSED_SHELL)`.
Topology from the profile (outer CCW, holes CW), height h:
- Vertices: each segment start at z = 0 and z = h. Bottom/top edges per segment: line → `LINE`, arc → `CIRCLE` (axis at center, +z; `EDGE_CURVE ... same_sense = (arc is CCW)` with vertices in traversal order), bezier → `B_SPLINE_CURVE_WITH_KNOTS(3, ctrl, .UNSPECIFIED., .F., .F., (4,4), (0.,1.), .UNSPECIFIED.)`. Vertical edges per vertex: `LINE` along +z.
- Side face per segment: loop [bottom fwd, vertical@end up, top rev, vertical@start down]; surface: line → `PLANE` with normal = right of direction, same_sense .T.; arc → `CYLINDRICAL_SURFACE`, same_sense = arc CCW; bezier → `SURFACE_OF_LINEAR_EXTRUSION(bottom curve, VECTOR(+z, h))`, same_sense .T.
- Top face `PLANE` normal +z: outer bound uses edges forward, hole bounds forward (FACE_BOUND). Bottom face normal −z: all loops with edges reversed.
- [ ] Tests (`occt-import-js` in Node: `const occt = await (await import('occt-import-js')).default(); occt.ReadStepFile(new TextEncoder().encode(step), {linearUnit:'millimeter', linearDeflectionType:'absolute_value', linearDeflection:0.002, angularDeflection:0.1})`): success true; exactly 1 mesh; mesh volume (signed tetra sum) within ±0.1 % of `|area(profile)|·h` (area via sampleLoop at 0.0005 mm) for: spur z=12, spur z=48 hex bore, spur z=20 dflat bore, rack n=10, kerf-offset gear; bounding box z ∈ [0, h].
- [ ] Implement, pass, commit `feat(export): AP214 STEP solids for parts`.

### Task 11: Fusion script, spec sheet, CSV, JSON, bundle

**Files:** `src/core/export/fusion.ts`, `spec.ts`, `csv.ts`, `bundle.ts`, `src/core/example.ts`; tests `test/export/fusion.test.ts`, `spec.test.ts`, `bundle.test.ts`.

**Produces:**
- `fusionScript(project, solution, version): string` — Python: `run(context)` with try/except + `ui.messageBox(traceback)`; `setp(name, expr, units, comment)` updating or adding `design.userParameters`; params `gt_module` (mm), `gt_pa` (deg), `<S>_x`, `<S>_y` (mm), `cd_<A>_<B>` (mm), `<G>_face` (mm); deletes existing sketch named `GearTrain Layout` then creates it on `root.xYConstructionPlane`, `sketchPoints.add(Point3D.create(x/10, y/10, 0))`, construction lines between meshing shafts (`isConstruction = True`), message box summary at end. Header comment with project name and generator version.
- `layoutSvg(project, solution): string` (static, uses sampled-free exact SVG path: `M`, `L`, `A`, `C`) — shared with the UI diagram via `profileToPath(profile)` in `src/core/geometry/svgpath.ts` (created in this task).
- `specHtml(project, solution, version): string` — standalone printable HTML: summary (input, overall ratio input→each leaf shaft/rack, output speeds), tables shafts / gears / racks / meshes, issues list, embedded `layoutSvg`. Escape all user strings.
- `gearsCsv(project, solution)`: header `id,name,shaft,teeth,module,pitch_dia,outer_dia,root_dia,face_width,z_offset,x,y,rpm,phase_deg`.
- `exportBundle(project, solution, opts): {name:string;data:string}[]` — per-part DXF + STEP named `<id>_z<teeth>_m<module>` (rack `<id>_n<teeth>_m<module>`), `layout.dxf`, `geartrain_params.py`, `spec.html`, `geartrain.json`, `geartrain.csv`, `project.gear`. `zipBundle(files): Uint8Array` via fflate `zipSync`.
- `EXAMPLE_GEAR`: compound reduction + idler + rack demo that solves with no errors.
- [ ] Tests: fusion script passes `python3 -c "import ast,sys; ast.parse(open(sys.argv[1]).read())"`; contains `cd_G1_G2` with correct value; sanitizes id `G-1` → `G_1`; spec HTML contains every gear id, escapes `<script>` in project name; CSV row count = gears; bundle filenames as specified and zip unzips (fflate `unzipSync`) to same set; EXAMPLE_GEAR parses and solves with zero errors.
- [ ] Implement, pass, commit `feat(export): Fusion script, spec sheet, CSV/JSON and zip bundle`.

### Task 12: UI — state, editors, panels

**Files:** `src/ui/state.ts`, `App.tsx`, `ProjectPanel.tsx`, `ListEditor.tsx`, `TextEditor.tsx`, `IssuesPanel.tsx`, `ResultsPanel.tsx`, `styles.css`, `src/main.tsx`; test `test/ui/app.test.tsx` (jsdom env via `// @vitest-environment jsdom`).

**Produces:** `useProjectStore()` hook: `{project, setProject(p), update(fn), solution, selection, select(ids)}`; autosave to `localStorage['geargoober.project']` (gear text) with try/catch; initial load from storage else `EXAMPLE_GEAR`.
- ProjectPanel: name, pitch system select + value, PA select (20/14.5), Fit collapsible (4 numeric fields), input selector (shaft or rack target + value).
- ListEditor: sections Shafts / Gears / Racks / Meshes with Add / Remove and inline inputs (ids editable; renaming an id updates references); bore kind select with kind-specific fields.
- TextEditor: textarea showing `serializeGear(project)`; on edit, debounce 300 ms → `parseGear` → if ok setProject else show errors (line:col message) without touching project.
- Issues panel (click → select refs); Results table.
- Toolbar: New (blank project with one shaft), Open (file input `.gear,.json`), Save .gear, Save .json, Export (opens dialog, Task 14).
- [ ] Smoke test: renders App with example → shows gear ids; changing teeth input on G1 updates results rpm text.
- [ ] Implement, pass, `./gg build` OK, commit `feat(ui): editors, issues and results panels`.

### Task 13: UI — animated diagram

**Files:** `src/ui/Diagram.tsx`, `src/core/geometry/svgpath.ts` (if not already); test extend `test/ui/app.test.tsx`.

- SVG with `<g>` per part: path from `profileToPath(partProfile(..., {kerf:false, zeroPhase:true}).profile)` placed by `translate(x,y) rotate(phase + ω·t·mult)`; racks `translate` along local x by `v·t·mult mod p` (wrap). Y axis flipped (`scale(1,-1)` on root group) so +y up and CCW is visually CCW. Pitch circles dashed, shaft markers, labels (`id · rpm`) toggle. Unreachable parts grey and static; selected highlighted.
- Controls: play/pause, multiplier select (0.01, 0.1, 1, 10), labels toggle, fit-to-view. Wheel zoom about cursor, drag to pan (viewBox state). `requestAnimationFrame` loop only while playing.
- Clicking a part → `select([id, ...meshPartners])`.
- [ ] Test: diagram renders one `path[data-part]` per gear/rack.
- [ ] Implement, pass, commit `feat(ui): animated SVG train diagram`.

### Task 14: UI — export dialog, downloads, final build

**Files:** `src/ui/ExportDialog.tsx`, `src/ui/download.ts`; modify `App.tsx`, `README.md`.

- Dialog: disabled with message when `!solution.ok`; checkboxes "Apply kerf offset" for DXF (default `project.exportPrefs.kerfDxf`) and STEP (`kerfStep`) persisted into project; buttons: "Download all (.zip)", and per-file list from `exportBundle` with individual download links; errors from geometry (e.g. kerf too large) listed per part.
- `download(name, data: string|Uint8Array, mime)` via Blob + temporary `<a download>`.
- README: remove "in design" status, keep usage accurate to the built UI.
- [ ] Test: export dialog lists `layout.dxf` for example project.
- [ ] `./gg test` all green, `./gg build` → `dist/geargoober.html`, check no `http` script/link references in built file (`grep -c '<script src=' == 0`).
- [ ] Commit `feat(ui): export dialog and downloads`; final commit for README.

### Task 15: Final review

- [ ] Dispatch a fresh code reviewer (most capable model) on the whole branch against the spec; address findings; commit fixes.
