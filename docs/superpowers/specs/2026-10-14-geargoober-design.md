# GearGoober — Design Spec

**Date:** 2026-10-14
**Status:** Approved design, pending implementation plan

## 1. Purpose

A standalone, browser-based gear train designer. The user defines a train of
spur gears (including compound gears and idlers) and racks, sets one input
speed, and sees every shaft's speed and direction in an animated 2D diagram.
The tool exports fabrication-ready geometry (DXF, STEP) and layout
documentation (center distances, shaft positions, a Fusion 360 parameter
script) so the train can be integrated into designs in CAD.

### Success criteria

- Runs from a single `geargoober.html` opened from disk (`file://`) — no server,
  no network access required.
- Speeds, directions, and center distances are correct for any valid train.
- Exported gears mesh correctly when dropped onto the exported layout points
  in Fusion 360 (no tooth collision, specified backlash present).
- STEP exports import into Fusion 360 as closed solids.
- DXF exports import into Fusion 360 sketches at the correct scale (mm) and
  remain light (arcs + splines, not thousands of line segments).

### Fabrication context

Users fabricate with a mix of methods: laser/waterjet cutting (2D), 3D printing,
and CNC/off-the-shelf parts. Both 2D (DXF) and 3D (STEP) outputs are
first-class.

## 2. Scope

### In scope (v1)

- External spur gears, compound gears (several gears on one shaft), idlers.
- Rack and pinion.
- Pitch specified as metric module **or** diametral pitch, chosen per project.
- Pressure angle 20° (default) or 14.5°.
- Per-project fit settings: backlash, tip/root clearance coefficient, kerf,
  bore corner relief radius — all with sensible defaults.
- Bores: round, D-flat, hex, square.
- Exactly one input: a shaft RPM or a rack linear speed.
- Structured list editor + equivalent text format editor; view-only animated
  diagram.
- Exports: per-part DXF, layout DXF, per-part STEP, Fusion 360 parameter
  script, HTML spec sheet, JSON, CSV, `.gear` source.
- CAD target: **Fusion 360 only** for tool-specific output.

### Out of scope (v1)

- Internal/ring gears, planetary sets, helical, bevel, worm gears.
- Undercut trochoid modeling (warn only).
- Editing via the diagram (drag/drop, snapping).
- Multiple inputs.
- STEP assemblies (all parts positioned in one file).
- Tool-specific outputs for CAD other than Fusion 360 (see
  `docs/future/cad-integrations.md`).

## 3. Architecture

TypeScript + Vite + `vite-plugin-singlefile` producing one self-contained HTML
file. UI in Preact. All domain logic lives in `src/core/`, a pure TypeScript
layer with **no DOM dependencies**, fully unit-tested with Vitest.

```
gg                     # docker wrapper script
Dockerfile
src/
  core/
    model.ts           # Project types
    units.ts           # module/DP normalization
    solver.ts          # speeds, positions, phases, issues
    format/
      gearText.ts      # .gear text format parse/serialize
      json.ts
    geometry/
      involute.ts      # analytic involute
      bspline.ts       # cubic B-spline fitting/evaluation
      spur.ts          # spur gear profile
      rack.ts          # rack profile
      bore.ts          # bore hole profiles
      offset.ts        # kerf offset
    export/
      dxf.ts  step.ts  fusion.ts  spec.ts  csv.ts  zip.ts
  ui/                  # Preact components (thin)
  main.tsx
test/                  # mirrors src/core
docs/
```

Data flow: `Project` → `solve()` → `Solution` → (`geometry` per part) →
exporters / diagram. Every edit re-runs `solve()` synchronously.

## 4. Tooling

All build tooling runs in Docker. The host needs only Docker.

```
./gg dev        # Vite dev server on http://localhost:5173 (hot reload)
./gg test       # Vitest single run; `./gg test --watch` for watch mode
./gg build      # produces dist/geargoober.html
./gg shell      # interactive shell in the container
```

- `gg` is a bash script wrapping `docker build` / `docker run`.
- Image based on `node:22-alpine`, plus `python3` (for the Fusion script
  syntax check in tests).
- Repo is bind-mounted; `node_modules` lives in a named Docker volume so
  Linux-native binaries never land on the macOS host.
- `occt-import-js` is a **dev dependency only**, used in tests to validate
  STEP output. It is never bundled into the shipped HTML.

## 5. Data Model

```ts
type Bore =
  | { kind: 'round';  dia: number }
  | { kind: 'dflat';  dia: number; flatDepth: number }
  | { kind: 'hex';    acrossFlats: number }
  | { kind: 'square'; side: number };

interface Project {
  name: string;
  pitch: { system: 'module' | 'dp'; value: number }; // stored as entered
  pressureAngleDeg: 20 | 14.5;
  fit: {
    backlashMm: number;      // default 0.1
    clearanceCoef: number;   // default 0.25
    kerfMm: number;          // default 0
    cornerReliefMm: number;  // default 0.2 (hex/square bore corners)
  };
  input: { shaftId: string; rpm: number } | { rackId: string; mmPerSec: number };
  shafts: { id: string; name: string; bore: Bore }[];
  gears:  { id: string; name: string; shaftId: string; teeth: number;
            faceWidth: number; zOffset: number }[];
  racks:  { id: string; name: string; teeth: number; faceWidth: number;
            backHeight: number }[];
  meshes: { a: string /* gearId */; b: string /* gearId | rackId */;
            angleDeg: number;
            offset?: number /* rack meshes: contact x along the rack, used
                               when the gear is positioned from the rack */ }[];
}
```

- All lengths in mm. DP converts as `m = 25.4 / DP`; the entered system and
  value are preserved for display and round-trip.
- Compound gears = multiple gears sharing a `shaftId`; `zOffset` places each
  along the shaft axis.
- `mesh.angleDeg` is the direction from gear `a`'s shaft to gear `b`'s shaft
  (or, for racks, the direction from the gear center toward the rack pitch
  line). The first shaft defined is placed at the origin.
- The bore belongs to the shaft; every gear on that shaft gets it.

### Text format (`.gear`)

Line-based, `#` comments, whitespace-separated tokens. Example:

```
project "Clock reduction"
pitch module 1.0            # or: pitch dp 24
pressure_angle 20
fit backlash 0.1 clearance 0.25 kerf 0.15 relief 0.2
input S1 rpm 1000           # or: input R1 mmps 50

shaft S1 bore round 5
shaft S2 bore dflat 5 0.5
shaft S3 bore hex 6.35
shaft S4 bore square 5
gear  G1 on S1 teeth 12 width 6
gear  G2 on S2 teeth 48 width 6
gear  G3 on S2 teeth 12 width 6 z 6
rack  R1 teeth 30 width 6 back 5
mesh  G1 G2 angle 0
mesh  G3 R1 angle 270
```

Optional tokens (`z`, `back`, `name "..."`, fit sub-keys) take defaults when
omitted. Parse errors report line and column. `parse(serialize(p))` must equal
`p`. JSON (`geargoober.json`) is an alternate save format of the same model.

## 6. Solver

`solve(project: Project): Solution` — pure, never throws; problems are reported
as issues.

1. **Graph:** nodes are shafts and racks; edges are meshes.
2. **Speeds:** BFS from the input.
   - gear→gear: `ω_b = −ω_a · Z_a / Z_b`
   - gear→rack: `v = ω · r_pitch` (signed)
   - Each shaft gets RPM and direction (CW/CCW); each gear gets pitch-line
     speed and torque ratio relative to the input.
3. **Positions:** first shaft at (0,0). Center distance is the theoretical
   `m·(Z_a + Z_b)/2` (backlash is applied to tooth thickness, not center
   distance). The new shaft is placed along `angleDeg`. A rack's pitch line
   is placed at `r_pitch` from the gear center, perpendicular to the angle,
   centered on the contact point.
4. **Phases:** each gear's rotation so its teeth sit in its mate's gaps.
   Consumed by the diagram, layout DXF and per-part exports.
5. **Issues** (`{ severity: 'error' | 'warning', message, refs: string[] }`):
   - Errors: loop gives a shaft conflicting speed, or conflicting position
     (> 0.01 mm); dangling references; mesh between gears on the same shaft;
     input not found.
   - Warnings: teeth below undercut limit (17 @ 20°, 32 @ 14.5°); non-meshing
     gears on different shafts overlapping in 2D on overlapping z ranges;
     meshing pair whose z ranges don't overlap; bore too large for root
     diameter; rack too short for its contact point; contact ratio < 1.2;
     parts unreachable from the input (they get geometry, no speed).

```ts
interface Solution {
  shafts: { id; x; y; rpm?; dir?: 'cw' | 'ccw' }[];
  gears:  { id; pitchDia; outerDia; rootDia; baseDia; phaseDeg;
            rpm?; surfaceSpeed?; torqueRatio? }[];
  racks:  { id; origin; direction; length; mmPerSec? }[];
  meshes: { a; b; centerDist; ratio; contactRatio }[];
  issues: Issue[];
}
```

## 7. Geometry

Every part becomes an exact 2D profile, shared by all exporters and the
diagram.

```ts
type Segment =
  | { kind: 'line';   a: Vec2; b: Vec2 }
  | { kind: 'arc';    center: Vec2; r: number; start: number; end: number }
  | { kind: 'spline'; degree: 3; controlPoints: Vec2[]; knots: number[] };
interface Profile { outer: Segment[]; holes: Segment[][] }
```

### Spur gear

- Addendum `1.0·m`; dedendum `(1 + clearanceCoef)·m`.
- Involute flank from `max(base, root)` circle to tip circle, computed
  analytically and fit with cubic B-splines to **≤ 0.001 mm** deviation
  (spans subdivided until the tolerance is met).
- Tooth thickness at the pitch circle: `π·m/2 − backlash/2`.
- Tip: arc on the tip circle. Root: fillet arc (radius ≈ 0.38·m) blending into
  a root-circle arc; radial line joins base to root when the base circle is
  inside the root circle.
- Undercut is not modeled (warning only).
- Profile is rotated by the gear's solved phase unless "zero phase" is
  requested.

### Rack

Straight flanks at the pressure angle, flat tip and root lands, root fillets,
rectangular back of `backHeight`. Pitch line at y = 0 in rack-local
coordinates. Backlash applied as tooth thinning, same as gears.

### Bores

Round: circle. D-flat: arc + chord. Hex/square: polygon with corner relief
arcs of `cornerReliefMm`.

### Kerf offset

Outer profile offset outward by `kerf/2`, holes inward by `kerf/2`. Arcs offset
exactly; splines refit within 0.001 mm. Applied per export via an
"Apply kerf offset" option: default **on** for DXF, **off** for STEP, both
user-overridable and remembered per project.

## 8. Exporters

All pure: `(project, solution, options) → string | Uint8Array`. The UI offers
a single `.zip` of everything plus individual downloads.

| Output | File | Notes |
|---|---|---|
| Per-part DXF | `G1_z12_m1.dxf` | AC1015 (R2000) ASCII, `$INSUNITS=4`, `$MEASUREMENT=1`. ARC/LINE/SPLINE entities. Layers `PROFILE`, `BORE`, `PITCH_CIRCLE` (dashed reference), `CENTER`. Shaft center at origin. Solved phase applied by default. |
| Layout DXF | `layout.dxf` | All parts in assembled position, shaft center points, center-distance dimension lines and labels, separate layers. |
| Per-part STEP | `G1_z12_m1.step` | Hand-written AP214. `MANIFOLD_SOLID_BREP`: planar top/bottom faces (bore as inner loop); side faces `PLANE` (lines), `CYLINDRICAL_SURFACE` (arcs), `SURFACE_OF_LINEAR_EXTRUSION` of `B_SPLINE_CURVE_WITH_KNOTS` (flanks). Extruded `faceWidth`, bottom at z = 0. |
| Fusion script | `geartrain_params.py` | Creates or updates User Parameters (`gt_module`, `gt_pa`, `S1_x`, `S1_y`, `cd_G1_G2`, `G1_face`, …) and a sketch `GearTrain Layout` with construction points at shafts and construction lines between meshing shafts. Idempotent. Header comment records project name and generator version. |
| Spec sheet | `spec.html` | Printable. Summary (input, overall ratio, output speeds); tables for shafts, gears, meshes; all issues; embedded layout SVG. |
| Data | `geartrain.json`, `geartrain.csv` | JSON: project + solution. CSV: gear table. |
| Source | `project.gear` | Text format. |

## 9. UI

Single page, Preact.

- **Left panel:** project settings (pitch system/value, pressure angle,
  collapsible fit settings, input), then Shafts / Gears / Racks / Meshes lists
  with add/remove and inline editing. A **Text** toggle swaps the lists for a
  `.gear` text editor; parse errors are shown inline with line numbers. Both
  views edit the same `Project`.
- **Diagram (center):** view-only SVG, pan/zoom, fit-to-view. Gears rendered
  from geometry profiles at solved positions and phases, animated from solved
  RPM × playback multiplier (play/pause, speed selector, label toggle).
  Clicking a part selects its list row and highlights its connections.
  Unreachable parts render grey and static.
- **Issues panel:** solver issues; clicking selects the referenced items.
- **Results panel:** table of shafts/gears with RPM, direction, ratio, center
  distances.
- **Toolbar:** New, Open (`.gear`/`.json`), Save `.gear`, Save `.json`,
  Export menu (zip or individual files, kerf options).
- **Persistence:** autosave to `localStorage`; an example project loads on
  first run.

## 10. Error Handling

- Core never throws for user-caused problems; the solver returns issues and
  the parser returns `{ ok: false, errors: [{ line, col, message }] }`.
- Exports are disabled while the solver reports errors; warnings do not block
  export but are listed in the spec sheet.
- `localStorage` read failures fall back to the example project.

## 11. Testing

TDD on `src/core/`, run via `./gg test`.

- **Solver:** simple pair, compound reduction, idler (direction), rack speed,
  consistent loop, conflicting-speed loop, conflicting-position loop,
  disconnected part, each warning type.
- **Geometry:** involute points vs analytic formula; spline fit ≤ 0.001 mm;
  profiles are closed and continuous; tooth thickness after backlash; **two
  meshing gears at their solved phases have no 2D overlap** and show the
  expected backlash gap; bore shapes; kerf offset distance.
- **Formats:** `.gear` round trip; error reporting for malformed lines; JSON
  round trip; DP ↔ module normalization.
- **Exporters:** DXF header/units/layers/entity types; **STEP re-imported via
  `occt-import-js` → exactly one closed solid with volume within ±0.1 % of
  expected**; Fusion script passes `python3 -c "import ast; ast.parse(...)"`;
  CSV/JSON shape.
- **UI:** light smoke test (renders example project, edit updates diagram).

## 12. Future Work

- CAD integrations beyond Fusion 360: `docs/future/cad-integrations.md`.
- Internal/planetary gears, helical, bevel, worm.
- Diagram editing (drag, snap).
- STEP assembly export.
- Undercut trochoid modeling and profile shift.
