# RC Stage Blimp Trainer

A local browser-based RC training simulator for a small indoor helium blimp, built with Vite, TypeScript, Three.js, and the browser Gamepad API.

This is an operator-floor trainer, not a cockpit sim. The default camera places the pilot on the floor looking at the craft across an indoor rehearsal arena with a stage, truss, video wall, barriers, target gates, and hanging cable obstacles.

## Setup

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://127.0.0.1:5173
```

## DJI Remote Controller 2

1. Plug a USB-C data cable into the PC.
2. Open Chrome or Edge.
3. Open the app.
4. Move sticks or press a button so the browser detects the controller.
5. Open `Calibrate`, leave sticks centered, then press `Calibrate center`.
6. Remap or invert axes if needed.

The default Gamepad API mapping assumes:

- Left stick Y: vertical thrust, center-off, up climbs
- Left stick X: pitch / nose up-down
- Right stick Y: forward/back translation thrust
- Right stick X: yaw

Different firmware/browser combinations can expose axes in a different order, so the calibration panel lets each control use any raw axis `0` through `7` and invert it independently.

## Keyboard Fallback

- `W` / `S`: climb / descend vertical thrust
- `A` / `D`: pitch
- `ArrowUp` / `ArrowDown`: forward / back translation
- `ArrowLeft` / `ArrowRight`: yaw
- `R`: reset
- `Esc`: pause/settings

## Craft

Pick a craft from the toolbar. Both fly the **identical** flight model — only the look
changes:

- **Blimp**: the RC stage envelope with a windowed gondola, cruciform tail, and four
  ducted thrusters.
- **LAPD helicopter**: a police-liveried helicopter shell matching the show aircraft —
  navy/white fuselage, glass canopy, landing skids, tail boom + rotor, and the four
  ducted props (nose, top, both sides) standing in for the lift props.

## Scenes

Pick a scene from the toolbar. The flight model is identical in every scene; only the
environment and default wind change (wind is still tunable in Settings).

- **Indoor arena**: the original rehearsal venue — stage, truss, video wall, barriers,
  and hanging-cable obstacles.
- **Nature**: a procedural outdoor world with rolling hills, lakes, a winding river,
  trees, rocks, and grass. Press **Regenerate** for a fresh map (same seed reproduces
  the same world). Touching water or terrain counts as a contact.
- **City**: a procedural street grid of window-lit buildings with parks and a canal.
  Buildings are solid; **Regenerate** lays out a new city.

## Tutorial

A guided, step-by-step intro that coaches each control in turn (altitude hold, yaw to a
beacon, ease-and-stop translation, a combined move, then a slow ring pass). Each step
shows an objective, a coaching hint, and a target marker, and auto-advances once you
hold the step's condition. Available in every scene.

## Challenges

Each challenge shows a live objective and progress, and ends with a result card rating
your run **Bronze / Silver / Gold** from explainable thresholds (time, precision,
contacts). **Retry** restarts the run.

- **Station keeping**: hold the blimp inside the box for 15 seconds.
- **Ring run**: fly through every ring in order. The next ring glows and shows an arrow;
  cleared rings turn green. Medal is based on total time vs. par and contacts.
- **Spot landing**: settle gently inside the landing ring and hold for 2 seconds.
- **Stage pass** (arena): a slow, level pass over the stage lane to the back.
- **Nose-in hold** (arena): hold position with the nose pointed at the pilot.

## Free flight

Outdoor and city scenes start in free flight — just explore. Toggle **Ring course** to
fly a timed, regenerable ring run laid over the world.

## Tuning

Open `Settings` in the app to tune the live blimp model:

- `mass`
- `buoyancyRatio`
- `linearDrag`
- `angularDrag`
- `verticalThrust`
- `forwardThrust`
- `yawTorque`
- `pitchTorque`
- `motorLag`
- `windStrength`
- `deadzone`
- `maxArenaHeight`

Defaults are intentionally sluggish, floaty, delayed, and easy to overcorrect. The vertical axis is center-off: centered stick means the vertical motors are off, while buoyancy and drag decide the remaining slow drift.

## Real-World Scale Assumptions

The default model follows the field notes currently available:

- Hull length: about 30 ft / 9.14 m
- Hull width: about 5 ft / 1.52 m
- Overall height: about 8 ft / 2.44 m
- Inertial all-up mass without helium lift: about 18-20 lb / 8-9 kg
- Effective net heaviness with helium: a few hundred grams, tuned by `buoyancyRatio`

That means the sim uses the higher mass for inertia and overshoot, while buoyancy cancels most of the weight. The result should feel big, slow, and reluctant to stop rather than like a tiny quadcopter.
