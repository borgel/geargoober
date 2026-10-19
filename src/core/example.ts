// Starter project shown on first launch.
export const EXAMPLE_GEAR = `project "Example: two-stage reduction to a rack"
pitch module 1
pressure_angle 20
fit backlash 0.1 clearance 0.25 kerf 0.15 relief 0.2
input S1 rpm 100

shaft S1 name "Motor" bore dflat 5 0.5
shaft S2 bore hex 6.35
shaft S3 bore round 6
shaft S4 name "Idler" bore round 4
gear  G1 name "Motor pinion" on S1 teeth 17 width 6
gear  G2 on S2 teeth 51 width 6
gear  G3 on S2 teeth 17 width 6 z 6
gear  G4 on S3 teeth 43 width 6 z 6
gear  G5 on S3 teeth 18 width 6 z 12
gear  G6 name "Idler" on S4 teeth 32 width 6 z 12
rack  R1 teeth 16 width 6 back 6
mesh  G1 G2 angle 0
mesh  G3 G4 angle 70
mesh  G5 G6 angle 150
mesh  G6 R1 angle 90
`;
