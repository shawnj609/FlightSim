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

## Training Modes

- Hover box: hold inside the transparent box for 60 seconds. Score favors low position error and smooth stick work.
- Gate pass: fly through floating inflatable rings in order.
- Precision stop: arrive in the target ring and stop with low velocity.
- Stage pass: make a slow pass over the stage without hitting truss or cables.
- Nose-in control: gate work while keeping the nose yawed toward the pilot camera.

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
