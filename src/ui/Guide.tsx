// The gear guide: plain-language notes on each parameter and the tradeoff it controls.
import { useEffect, useRef } from 'preact/hooks';
import type { GuideTopic } from './help';

interface Props {
  topic: GuideTopic | null;
  onClose: () => void;
}

export function Guide({ topic, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.show === 'function') d.show();
      else d.setAttribute('open', '');
    }
  }, []);
  useEffect(() => {
    if (!topic) return;
    const el = ref.current?.querySelector(`#guide-${topic}`);
    (el as HTMLElement | null)?.scrollIntoView?.({ block: 'start' });
    (el as HTMLElement | null)?.focus?.({ preventScroll: true });
  }, [topic]);

  return (
    <dialog ref={ref} class="guide" aria-label="Gear guide" onClose={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <header>
        <h2>Gear guide</h2>
        <button type="button" class="icon" aria-label="Close guide" onClick={onClose}>
          ×
        </button>
      </header>
      <div class="guide-body">
        <p class="lede">
          What each setting means, and what you trade away when you change it. Numbers here are starting points: cut or print a test pair
          before committing to a design.
        </p>

        <section id="guide-module" tabIndex={-1}>
          <h3>Module and diametral pitch</h3>
          <p>
            Module sets tooth size. A gear's pitch diameter is module × teeth, and each tooth stands 2.25 × module tall. Diametral pitch is
            the imperial version, counted the other way: teeth per inch of pitch diameter, so module = 25.4 ÷ DP.
          </p>
          <ul>
            <li>Bigger teeth (larger module, smaller DP) are stronger and more forgiving of loose tolerances, but a given diameter holds fewer of them, so ratios get coarser and gears get bigger.</li>
            <li>Every gear in one train must share the module and pressure angle, or they won't mesh.</li>
            <li>For 3D printing, module 1 or more prints cleanly on a 0.4 mm nozzle; below about 0.8 the teeth get mushy.</li>
          </ul>
        </section>

        <section id="guide-pressure-angle" tabIndex={-1}>
          <h3>Pressure angle</h3>
          <p>The angle at which teeth push on each other. It shapes the tooth: higher angles give a wider, stronger base.</p>
          <ul>
            <li>
              <strong>20°</strong> is today's standard. Stronger teeth, and pinions down to 17 teeth without undercut.
            </li>
            <li>
              <strong>14.5°</strong> is an older standard. Teeth are slimmer and run a little smoother and quieter, but undercut starts
              below 32 teeth. Mostly useful for matching existing gears.
            </li>
            <li>Higher angles also push the shafts apart harder, which loads bearings more.</li>
          </ul>
        </section>

        <section id="guide-teeth" tabIndex={-1}>
          <h3>Tooth count</h3>
          <ul>
            <li>
              <strong>Undercut.</strong> Below about 17 teeth (20°) a hobbed gear has its tooth roots cut away, which weakens them. This tool
              draws the full tooth shape and warns instead; small pinions still work, but expect more wear and possible rubbing at the root.
            </li>
            <li>
              <strong>Pointed teeth.</strong> Very small gears, or large backlash, can thin teeth to a point below the tip. The tool flags it.
            </li>
            <li>
              <strong>Smoothness.</strong> More teeth on both gears means more teeth in contact at once (see contact ratio) and quieter
              running.
            </li>
            <li>
              <strong>Even wear.</strong> When two tooth counts share no common factor (say 17 and 51 don't qualify, but 17 and 50 do), every
              tooth eventually meets every tooth on its mate, which spreads wear. This matters most for long-running metal gears.
            </li>
          </ul>
        </section>

        <section id="guide-ratios" tabIndex={-1}>
          <h3>Ratios, idlers and compound gears</h3>
          <ul>
            <li>Speed falls by the tooth ratio at each mesh: a 12-tooth gear driving a 48 turns it at a quarter speed and four times the torque (minus friction).</li>
            <li>Each external mesh reverses direction. An idler gear between two others restores the direction without changing the ratio.</li>
            <li>
              A big single reduction needs a huge gear. Two gears on one shaft (a compound gear) multiply ratios instead: 1:4 then 1:4 gives
              1:16 in a small space. Use the Z column to stack them so each one meets its own mate.
            </li>
          </ul>
        </section>

        <section id="guide-layout" tabIndex={-1}>
          <h3>Mesh angle, center distance and Z</h3>
          <ul>
            <li>Center distance is fixed by the two tooth counts and the module: module × (teeth A + teeth B) ÷ 2. You only choose the direction.</li>
            <li>The mesh angle is that direction, measured counter-clockwise from +x. It changes the layout, never the speeds.</li>
            <li>Z stacks gears along a shaft. Meshing gears must overlap in Z, and gears that don't mesh may only overlap in plan if they're at different Z.</li>
            <li>Shaft positions and center distances are exported to the Fusion script and spec sheet; hold them to a tight tolerance in your housing.</li>
          </ul>
        </section>

        <section id="guide-contact-ratio" tabIndex={-1}>
          <h3>Contact ratio</h3>
          <p>
            The average number of tooth pairs touching at once. Below 1.2 there are moments where barely one pair carries the load, so
            motion gets rough and noisy. 1.4–1.8 is typical. It rises with tooth count and falls with higher pressure angles.
          </p>
        </section>

        <section id="guide-backlash" tabIndex={-1}>
          <h3>Backlash</h3>
          <p>
            The gap between meshing teeth, made here by thinning every tooth by half the backlash so shaft positions stay at their exact
            theoretical distance.
          </p>
          <ul>
            <li>Too little and gears bind when parts swell, print slightly fat, or shafts are a little off.</li>
            <li>Too much gives slop when the drive reverses, and more noise.</li>
            <li>Starting points: 0.15–0.3 mm for 3D printing, 0.1–0.2 mm for laser-cut plastic, 0.05–0.1 mm for machined metal at module 1.</li>
          </ul>
        </section>

        <section id="guide-clearance" tabIndex={-1}>
          <h3>Root clearance</h3>
          <p>
            Extra depth below each tooth so a mate's tip never hits the bottom of the gap. It's a multiple of module; 0.25 is the standard.
            More clearance tolerates sloppy center distances and debris, but leaves less material at the tooth root, so teeth are weaker.
          </p>
        </section>

        <section id="guide-face-width" tabIndex={-1}>
          <h3>Face width</h3>
          <p>
            How thick the gear is. Load capacity grows roughly with width, so wider teeth last longer. Past about 8–12 × module, small
            alignment errors mean only one edge of the tooth actually carries load, so extra width stops helping.
          </p>
        </section>

        <section id="guide-kerf" tabIndex={-1}>
          <h3>Kerf</h3>
          <p>
            The width of material a laser or waterjet removes. With kerf compensation on, outlines grow and bores shrink by half the kerf so
            cut parts come out at the drawn size.
          </p>
          <ul>
            <li>Typical: 0.1–0.3 mm for lasers, 0.8–1.0 mm for waterjets. Measure yours by cutting a 20 mm test square.</li>
            <li>The kerf must be no more than twice the smallest inside curve, the root fillet (0.38 × module). Small modules limit how wide a cut you can compensate.</li>
            <li>Leave it off for STEP files you 3D print; use your slicer's horizontal expansion instead.</li>
          </ul>
        </section>

        <section id="guide-bores" tabIndex={-1}>
          <h3>Bores and corner relief</h3>
          <ul>
            <li>D-flat, hex and square bores transmit torque without a set screw or key.</li>
            <li>
              <strong>Rounded corners</strong> make a snug fit on stock whose corners are already rounded, which most hex bar is. A shaft with
              truly sharp corners won't seat fully.
            </li>
            <li>
              <strong>Dog-bone corners</strong> cut a small circle past each corner so sharp-cornered stock always seats, at the cost of tiny
              gaps at the corners. Common for laser and CNC parts.
            </li>
            <li>Keep at least one module of material between the bore and the tooth roots, or the gear can crack there.</li>
          </ul>
        </section>

        <section id="guide-racks" tabIndex={-1}>
          <h3>Racks</h3>
          <p>
            A rack is a gear unrolled flat. It moves at the pinion's surface speed, rpm × 2π × pitch radius ÷ 60 mm/s, and each tooth is π ×
            module long, so the number of teeth sets how far it can travel. Use the mesh offset to place a second pinion further along the
            same rack.
          </p>
        </section>
      </div>
    </dialog>
  );
}
