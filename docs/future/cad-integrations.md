# Future: CAD Integrations Beyond Fusion 360

v1 targets Fusion 360 only for tool-specific output. The tool-neutral exports
(per-part DXF/STEP, layout DXF, spec sheet, JSON, CSV) work in any CAD tool;
this document captures what a tool-specific exporter would add for each.

Each would be a new pure exporter in `src/core/export/` consuming the same
`Project` + `Solution`.

## Comparison

| | Fusion 360 (v1) | Onshape | FreeCAD | SolidWorks / Inventor |
|---|---|---|---|---|
| **Parameter import** | No native CSV → params. Generated Python script creates User Parameters. | Variables live in Part Studios; idiomatic route is a FeatureScript feature or pasted variable table. | Spreadsheet workbench imports CSV directly; aliased cells become parametric variables. | Design tables (Excel) or linked equations `.txt` for global variables. |
| **DXF quirks** | Heavy polylines bog sketches; prefer arcs + splines; explicit mm units. | Good DXF import, splines fine. | DXF import more fragile; polylines safest. | Polylines or splines both fine. |
| **STEP** | Clean import. | Clean import. | Clean import. | Clean import. |

## Onshape

- **Exporter:** a FeatureScript feature (`geartrain.fs`) that defines variables
  (`#S1_x`, `#cd_G1_G2`, …) and creates a sketch with points at shaft
  centers. Users paste into a Feature Studio and add the feature to a Part
  Studio.
- **Alternative:** a variable table text snippet for manual entry.
- **DXF:** current R2000 output with splines should work as-is; verify layer
  handling.
- **Stretch:** Onshape REST API push (requires OAuth — conflicts with the
  no-hosting goal; likely out of scope).

## FreeCAD

- **Exporter:** `geartrain_params.csv` laid out for the Spreadsheet workbench
  (column A names, column B values) plus a small macro (`geartrain.FCMacro`)
  that imports it, sets cell aliases, and builds a sketch of shaft points.
- **DXF:** offer a "polyline mode" that flattens splines to polylines within a
  tolerance, since FreeCAD's DXF importer is less robust with splines.
- **Bonus:** FreeCAD's Python API could build the gear solids natively from
  the profile data, bypassing STEP.

## SolidWorks

- **Exporter:** an equations file (`geartrain_equations.txt`) in
  `"name" = value` format, suitable for *Link to external file* in the
  Equations manager, so parameters update when the file is regenerated.
- **Alternative:** design table `.xlsx` (needs an xlsx writer — heavier).
- **DXF:** current output fine.

## Inventor

- **Exporter:** parameters `.xlsx` linked via *Link* in the Parameters dialog,
  or an iLogic rule (`.iLogicVb`) that sets user parameters and sketch
  points.
- **DXF:** current output fine.

## Shared prerequisites

- A **polyline fallback** option in the DXF exporter (tolerance-driven spline
  flattening) — useful for FreeCAD and for older/limited tools.
- A stable **parameter naming scheme** (already defined for Fusion:
  `S<n>_x`, `S<n>_y`, `cd_<A>_<B>`, `<G>_face`, `gt_module`, `gt_pa`) reused by
  every exporter so documentation and scripts agree across tools.
