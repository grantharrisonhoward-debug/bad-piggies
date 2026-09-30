# Contraption Cave

A browser sandbox game inspired by the "build a vehicle, then drive it" genre. Every part is unlocked. Build a contraption on a grid, then take it through a huge (~1.6 km) cave full of hills, pits, jump ramps, tall chambers with floating ledges, stalactites, crate stacks and hidden stars. A golden trophy waits at the far end.

The pilot is **Pip**, a goggled cave-mole.

## Play

Open `index.html` in a browser. There's no build step and no server needed. You can also serve the folder, for example with `python3 -m http.server`, and visit `http://localhost:8000`.

## Parts

| Part | What it does |
| --- | --- |
| Pilot | Pip's crate. The camera follows it |
| Wood / Metal frame | The structure. Adjacent frames are glued together. Metal is heavier and much stronger |
| Wheel / Small wheel | Attaches to a neighbouring frame and needs an Engine to drive |
| Engine | Powers every wheel. More engines give more torque and speed |
| Rocket | Strong thrust. Click it again in the workshop to rotate it |
| Fan | Gentle thrust. Also rotatable |
| Balloon | Tied to the part below (or beside) it and lifts it |
| Wing | Flat-plate aerodynamics, good for gliding off jumps |
| TNT | Explodes on a hard hit or when detonated, and sets off other TNT |

Joints snap under heavy stress, so big crashes break your contraption apart.

## Controls

| Key | Action |
| --- | --- |
| ← → / A D | Drive |
| Space | Toggle rockets |
| F | Toggle fans |
| B | Pop a balloon |
| X | Detonate TNT |
| Q / E | Lean back / forward |
| Mouse wheel, + / − | Zoom |
| Esc | Back to the workshop |
| Backspace | Restart the run |
| 1–0, − (workshop) | Pick a part. Delete picks the eraser. R rotates the hovered part |

Touch controls appear on screen during a run. Your design and the stars you've found are saved in `localStorage`.

## Code

- `js/art.js` holds the part definitions and all hand-drawn canvas art.
- `js/level.js` is the seeded cave generator.
- `js/sim.js` is the physics run (contraption assembly, thrust, joint breaking and explosions). It has no DOM dependencies.
- `js/game.js` is the workshop editor, renderer, input and HUD.
- `lib/planck.min.js` is [Planck.js](https://github.com/piqnt/planck.js) 1.4.2, a Box2D port (MIT, see `lib/planck-LICENSE.txt`).
