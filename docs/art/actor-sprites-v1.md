# Thornwrithe Actor Sprites v1

## Goal

Replace runtime-generated PC and mob drawings with hand-drawn bitmap sprites that feel like compact old-school D20 fantasy RPG artwork.

## Files

- Source art: `art/source/actors/v1/actor-sprites-v1.aseprite`
- Runtime sheet: `public/art/actors/v1/actor-sprites-v1.png`
- Runtime manifest: `public/art/actors/v1/actor-sprites-v1.json`

## Sheet

- PNG: `actor-sprites-v1.png`
- Size: `192x480`
- Frame size: `48x48`
- Frames: `40`
- Layout: `4` columns by `10` rows
- Anchor: bottom-center, `{ "x": 0.5, "y": 1 }`
- Background: Transparent background
- Filtering: nearest-neighbor only

## Pose Columns

1. `idle`
2. `step-left`
3. `step-right`
4. `strike`

## Actor Rows

1. `pc-fighter`
2. `pc-rogue`
3. `pc-wizard`
4. `pc-cleric`
5. `pc-ally`
6. `mob-briar-goblin`
7. `mob-sap-wolf`
8. `mob-root-troll`
9. `mob-vampire-lord`
10. `mob-generic`

## Quality Gates

- Every row has all four poses.
- Silhouettes remain readable at roughly `20-40px` in the playfield.
- Fighter reads as shield and sword.
- Rogue reads as hood and dagger.
- Wizard reads as hat and staff.
- Cleric reads as holy symbol and mace.
- Mobs are fantasy threats, not stick figures or oversized vector shapes.
- No antialiasing, blur, SVG export, procedural sprite generation, or TypeScript block-array artwork.
- Manifest row order must match the PNG exactly.
