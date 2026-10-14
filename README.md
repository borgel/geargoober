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

> **Status:** in design. See
> [`docs/superpowers/specs/2026-10-14-geargoober-design.md`](docs/superpowers/specs/2026-10-14-geargoober-design.md).

## Using it

Open `geargoober.html` in any modern browser. That's it. Your work autosaves
in the browser; use **Save** to keep a `.gear` file you can share or put in
git.

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
direction the second gear sits from the first.

### Getting it into Fusion 360

1. **Export → All (zip)** and unzip somewhere.
2. In Fusion, run `geartrain_params.py` (Utilities → Add-Ins → Scripts and
   Add-Ins → green **+**, pick the file, Run). This creates user parameters and
   a `GearTrain Layout` sketch with a point at each shaft.
3. Insert gears: **Insert → Insert DXF** for 2D outlines, or for 3D upload the
   `.step` files to your Fusion project and use **Insert into Current Design**.
   Place each one on its shaft point — gears are pre-rotated so their teeth
   mesh.

Fit settings (backlash, clearance, kerf) are per project under **Fit**.

## Building from source

You only need Docker.

```sh
./gg dev      # live dev server at http://localhost:5173
./gg test     # run tests
./gg build    # produces dist/geargoober.html
./gg shell    # shell inside the build container
```

## Roadmap

Support for other CAD tools (Onshape, FreeCAD, SolidWorks, Inventor) is
sketched in [`docs/future/cad-integrations.md`](docs/future/cad-integrations.md).
Internal/planetary, helical, bevel, and worm gears are future work.
