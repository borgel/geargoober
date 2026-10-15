# GearGoober

A gear train designer that runs entirely in your browser — one HTML file, no
server, no install.

Define a train of spur gears and racks, set an input speed, and see the speed
and direction of every shaft in an animated diagram. When you're happy, export
everything you need to build it:

- **DXF** outlines of each gear (for laser / waterjet cutting, or CAD sketches)
- **STEP** solids of each gear (for 3D printing or CAD)
- A **layout DXF** with every gear in place and shaft centers marked
- A **Fusion 360 script** that creates parameters and a sketch of shaft
  positions and center distances
- A printable **spec sheet** of what meshes with what, speeds, ratios, and
  spacing

Design notes live in
[`docs/superpowers/specs/2026-10-14-geargoober-design.md`](docs/superpowers/specs/2026-10-14-geargoober-design.md).

## Using it

Build it once (see below) and open `dist/geargoober.html` in any modern
browser — straight from disk, no server. Your work autosaves in the browser;
use **Save .gear** to keep a file you can share or put in git.

- **Parts** tab: set pitch (module or diametral pitch), pressure angle, the
  input shaft or rack and its speed, then add shafts, gears, racks and meshes.
  **Fit allowances** holds backlash, root clearance, cutter kerf and bore
  corners (rounded, or dog-bone cut-outs that clear sharp-cornered stock).
  Every measurement shows its unit.
- **Gear guide** (toolbar, or any **?** next to a setting) explains what each
  parameter does and what you trade away by changing it.
- **Text** tab: the same project as editable text (below).
- The diagram is to scale on a millimetre grid. Blue-grey parts turn
  counter-clockwise, bronze parts clockwise, grey parts aren't driven. Scroll
  to zoom, drag to pan, click a part to highlight it and its mates.
- **Problems** lists errors (which block export) and warnings such as
  undercut, overlapping gears, or a gear passing over another shaft.
- Positive rpm means counter-clockwise, seen from +z.

### The `.gear` text format

You can build a train in the list editor, or switch to **Text** and write it
directly:

```
project "Simple reduction"
pitch module 1.0
input S1 rpm 1000

shaft S1 bore round 5
shaft S2 bore hex 6.35
gear  G1 on S1 teeth 12 width 6
gear  G2 on S2 teeth 48 width 6
mesh  G1 G2 angle 0
```

Gears on the same shaft turn together (compound gears). `angle` sets which
direction the second gear sits from the first, in degrees counter-clockwise
from +x. Other optional bits: `name "..."` on parts, `z <mm>` to stack gears
on a shaft, `back <mm>` for rack thickness below the teeth, and
`offset <mm>` on a rack mesh to place a second pinion along the rack.
`fit … relief_style dogbone` switches bore corners to dog-bone cut-outs. Ids
use letters, digits, `_`, `.` and `-`.

### Getting it into Fusion 360

1. **Export… → Download all (.zip)** and unzip somewhere.
2. In Fusion: Utilities → Add-Ins → Scripts and Add-Ins → **+** next to My
   Scripts, pick the unzipped `geartrain_params` folder, and Run. (Fusion runs
   scripts from a folder named like the script; if you download the `.py` on
   its own, put it in a `geartrain_params` folder first.) This
   creates user parameters and a `GearTrain Layout` sketch with a point at each
   shaft.
3. Insert gears: **Insert → Insert DXF** for 2D outlines, or for 3D upload the
   `.step` files to your Fusion project and use **Insert into Current Design**.
   Place each one on its shaft point — gears are pre-rotated so their teeth
   mesh.

Fit settings (backlash, clearance, kerf) are per project under **Fit
allowances**. In the export dialog you choose whether DXF and STEP files get
the kerf offset (by default DXF does, STEP doesn't).

Re-running the Fusion script after changing the train updates the parameters,
moves the existing shaft points (geometry you constrained to them follows
along) and removes points and lines for shafts or meshes you deleted.

## Building from source

You only need Docker.

```sh
./gg dev      # live dev server at http://localhost:5173
./gg test     # run tests
./gg build    # produces dist/geargoober.html
./gg shell    # shell inside the build container
```

### Publishing to GitHub Pages

`.github/workflows/pages.yml` tests, builds and publishes the app on every
push to `main` (or on demand from the Actions tab). Enable it once under
**Settings → Pages → Source: GitHub Actions**. The page is served as
`index.html`; it's the same single file as `dist/geargoober.html`.

## Roadmap

Support for other CAD tools (Onshape, FreeCAD, SolidWorks, Inventor) is
sketched in [`docs/future/cad-integrations.md`](docs/future/cad-integrations.md).
Internal/planetary, helical, bevel, and worm gears are future work.
